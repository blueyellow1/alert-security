
import 'dotenv/config';
import { JsonRpcProvider, Interface } from 'ethers';

const RPC_URL =
  process.env.RPC_URL || 'https://test-evm-rpc-v3.portaldot.dev';

const CONTRACT_ADDRESS =
  '0x44406CD3e7ccE420c316D015FEE74303F16629E5';

const provider = new JsonRpcProvider(RPC_URL);
const INTERVAL = Number(process.env.POLL_INTERVAL || 4000);
const LIMIT = Number(process.env.LARGE_TRANSFER_LIMIT || 10);

const contractInterface = new Interface([
  'event Paused(address by)',
  'event Unpaused(address by)',
  'event SecurityAlert(address user, string action)'
]);

let lastBlock = null;
let busy = false;

async function sendAlert(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log('[ALERT]', message);
    return;
  }

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `🚨 PORTLG Security Alert\n${message}`
      })
    }
  );

  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(result.description || 'Telegram alert failed');
  }

  console.log('Telegram alert sent.');
}

async function checkContractEvents(fromBlock, toBlock) {
  const logs = await provider.getLogs({
    address: CONTRACT_ADDRESS,
    fromBlock,
    toBlock
  });

  for (const log of logs) {
    let event;

    try {
      event = contractInterface.parseLog({
        topics: log.topics,
        data: log.data
      });
    } catch {
      continue;
    }

    if (!event) continue;

    let message;

    if (event.name === 'Paused') {
      message =
        `PORTLG contract PAUSED\n` +
        `By: ${event.args.by}\n` +
        `Transaction: ${log.transactionHash}`;
    } else if (event.name === 'Unpaused') {
      message =
        `PORTLG contract UNPAUSED\n` +
        `By: ${event.args.by}\n` +
        `Transaction: ${log.transactionHash}`;
    } else if (event.name === 'SecurityAlert') {
      message =
        `PORTLG protected action detected\n` +
        `User: ${event.args.user}\n` +
        `Action: ${event.args.action}\n` +
        `Transaction: ${log.transactionHash}`;
    } else {
      continue;
    }

    console.log(message);
    await sendAlert(message);
  }
}

async function checkTransfers(fromBlock, toBlock) {
  const watchlist = (process.env.WATCHLIST || '')
    .split(',')
    .map(address => address.trim().toLowerCase())
    .filter(Boolean);

  for (let n = fromBlock; n <= toBlock; n++) {
    const block = await provider.getBlock(n, true);
    if (!block) continue;

    for (const tx of block.prefetchedTransactions) {
      const amount = Number(tx.value) / 1e18;

      if (amount >= LIMIT) {
        await sendAlert(
          `Large transfer: ${amount} native tokens\n` +
          `From: ${tx.from}\n` +
          `To: ${tx.to || 'Contract creation'}\n` +
          `Transaction: ${tx.hash}`
        );
      }

      if (
        watchlist.includes(tx.from.toLowerCase()) ||
        (tx.to && watchlist.includes(tx.to.toLowerCase()))
      ) {
        await sendAlert(
          `Watchlist transaction: ${tx.hash}\n` +
          `From: ${tx.from}\n` +
          `To: ${tx.to || 'Contract creation'}`
        );
      }
    }
  }
}

async function monitor() {
  if (busy) return;
  busy = true;

  try {
    const currentBlock = await provider.getBlockNumber();

    if (lastBlock === null) {
      lastBlock = currentBlock;
      console.log(`Monitor started at block ${currentBlock}`);
      return;
    }

    if (currentBlock <= lastBlock) return;

    const fromBlock = lastBlock + 1;

    await checkContractEvents(fromBlock, currentBlock);
    await checkTransfers(fromBlock, currentBlock);

    lastBlock = currentBlock;
    console.log(`Checked through block ${lastBlock}`);
  } catch (error) {
    console.error('Monitor error:', error.message);
  } finally {
    busy = false;
  }
}

console.log('Starting PORTLG alert monitor...');
await monitor();
setInterval(monitor, INTERVAL);
