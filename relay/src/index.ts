import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import {
  rpc,
  Contract,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Keypair,
  Address,
  nativeToScVal,
  scValToNative,
  xdr,
  Account,
} from '@stellar/stellar-sdk';
import { buildActionRequestScVal, humanToStroops, stroopsToHuman } from './stellar/scval-builder';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const RPC_URL = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org:443';
const NETWORK_PASSPHRASE = Networks.TESTNET;

const server = new rpc.Server(RPC_URL);

// Load contract addresses
const addressesPath = path.join(__dirname, '../contract-addresses.json');
let contractAddresses = {
  registry: '',
  policy: '',
  router: '',
  network: 'testnet',
};

if (fs.existsSync(addressesPath)) {
  try {
    contractAddresses = JSON.parse(fs.readFileSync(addressesPath, 'utf8'));
    console.log('Loaded contract addresses:', contractAddresses);
  } catch (err) {
    console.error('Failed to load contract addresses, using empty config:', err);
  }
} else {
  console.warn('contract-addresses.json not found. Make sure to deploy contracts first.');
}

// Helpers for transaction simulation and submission
async function getAccount(publicKey: string) {
  try {
    return await server.getAccount(publicKey);
  } catch (err: any) {
    if (err.message && err.message.includes('404')) {
      throw new Error(`Account ${publicKey} not found. Please fund it first using Friendbot.`);
    }
    throw err;
  }
}

async function signAndSubmitTx(tx: any, signers: Keypair[]) {
  // 1. Prepare transaction (simulates, sets footprint, fees, etc.)
  const preparedTx = await server.prepareTransaction(tx);
  
  // 2. Sign with all required keys
  for (const signer of signers) {
    preparedTx.sign(signer);
  }

  // 3. Send transaction
  const response = await server.sendTransaction(preparedTx);
  if (response.status === 'ERROR') {
    throw new Error(`Transaction submission error: ${JSON.stringify(response.errorResult)}`);
  }

  // 4. Poll for status
  let txHash = response.hash;
  console.log(`Submitted transaction: ${txHash}. Polling status...`);
  
  let attempts = 0;
  while (attempts < 20) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const txStatus = await server.getTransaction(txHash);
    
    if (txStatus.status === 'SUCCESS') {
      console.log(`Transaction ${txHash} succeeded!`);
      // Parse events if any
      const events = txStatus.resultMetaXdr ? parseTxEvents(txStatus.resultMetaXdr) : [];
      return {
        hash: txHash,
        ledger: txStatus.ledger,
        events,
        result: txStatus.resultXdr,
      };
    } else if (txStatus.status === 'FAILED') {
      throw new Error(`Transaction ${txHash} failed: ${JSON.stringify(txStatus.resultXdr)}`);
    }
    attempts++;
  }
  
  throw new Error(`Transaction ${txHash} timed out during status polling.`);
}

function parseTxEvents(resultMeta: string | xdr.TransactionMeta): any[] {
  // Decode meta to extract contract events
  try {
    const meta = typeof resultMeta === 'string'
      ? xdr.TransactionMeta.fromXDR(resultMeta, 'base64')
      : resultMeta;
    const v3 = meta.v3();
    if (!v3) return [];
    
    const events: any[] = [];
    v3.sorobanMeta()?.events().forEach((evt) => {
      try {
        const contractId = evt.contractId()?.toString('hex');
        const topics = evt.body().v0().topics().map(t => scValToNative(t));
        const data = scValToNative(evt.body().v0().data());
        events.push({ contractId, topics, data });
      } catch (e) {
        // Skip undecodable events
      }
    });
    return events;
  } catch (err) {
    console.error('Failed to parse transaction events:', err);
    return [];
  }
}

// ----------------- API ENDPOINTS -----------------

// 1. Get current config
app.get('/api/config', (req, res) => {
  res.json({
    ...contractAddresses,
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
  });
});

// 1b. Generate keypair for testing
app.get('/api/generate-keypair', (req, res) => {
  try {
    const kp = Keypair.random();
    res.json({
      publicKey: kp.publicKey(),
      secret: kp.secret(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Register account (owner signs)
app.post('/api/register', async (req, res) => {
  const { ownerSecret, policyAddress, agents } = req.body;

  if (!ownerSecret || !policyAddress || !agents || !Array.isArray(agents)) {
    return res.status(400).json({ error: 'Missing parameters. ownerSecret, policyAddress, and agents[] are required.' });
  }

  try {
    const ownerKeypair = Keypair.fromSecret(ownerSecret);
    const ownerPubkey = ownerKeypair.publicKey();
    const sourceAccount = await getAccount(ownerPubkey);

    const contract = new Contract(contractAddresses.registry);
    
    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        contract.call(
          'register_account',
          new Address(ownerPubkey).toScVal(),
          new Address(policyAddress).toScVal(),
          nativeToScVal(agents.map(a => new Address(a)))
        )
      )
      .setTimeout(30)
      .build();

    const result = await signAndSubmitTx(tx, [ownerKeypair]);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Register Account failed:', err);
    res.status(500).json({ error: err.message || 'Registration failed' });
  }
});

// 3. Set Policy (owner signs)
app.post('/api/set-policy', async (req, res) => {
  const { ownerSecret, maxSpendPerAction, maxDailySpend, allowedAssets, expiryLedger } = req.body;

  if (!ownerSecret || !maxSpendPerAction || !maxDailySpend || !allowedAssets || !expiryLedger) {
    return res.status(400).json({ error: 'Missing parameters.' });
  }

  try {
    const ownerKeypair = Keypair.fromSecret(ownerSecret);
    const ownerPubkey = ownerKeypair.publicKey();
    const sourceAccount = await getAccount(ownerPubkey);

    const contract = new Contract(contractAddresses.policy);

    // Construct the PolicyConfig contracttype struct
    const configStruct = {
      owner: new Address(ownerPubkey),
      max_spend_per_action: humanToStroops(maxSpendPerAction),
      max_daily_spend: humanToStroops(maxDailySpend),
      daily_spent: 0n,
      daily_reset_ledger: 0,
      allowed_assets: allowedAssets.map((asset: string) => Symbol.prototype), // Wait, allowed_assets is Vec<Symbol>
      expiry_ledger: parseInt(expiryLedger, 10),
    };

    // Correctly serialize Vec<Symbol> using nativeToScVal with raw Symbol representations
    // Soroban Symbol is represented as a string wrapped in native conversion or raw xdr.ScVal
    const assetSymbols = allowedAssets.map((asset: string) => xdr.ScVal.scvSymbol(asset));

    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        contract.call(
          'set_policy',
          new Address(ownerPubkey).toScVal(),
          nativeToScVal({
            owner: new Address(ownerPubkey),
            max_spend_per_action: humanToStroops(maxSpendPerAction),
            max_daily_spend: humanToStroops(maxDailySpend),
            daily_spent: 0n,
            daily_reset_ledger: 0,
            allowed_assets: assetSymbols,
            expiry_ledger: parseInt(expiryLedger, 10),
          })
        )
      )
      .setTimeout(30)
      .build();

    const result = await signAndSubmitTx(tx, [ownerKeypair]);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Set Policy failed:', err);
    res.status(500).json({ error: err.message || 'Set policy failed' });
  }
});

// 4. Execute Action (Requires owner's signature because contract calls owner.require_auth())
app.post('/api/execute-action', async (req, res) => {
  const { ownerAddress, ownerSecret, agentAddress, destination, assetContract, amountHuman } = req.body;

  if (!ownerAddress || !ownerSecret || !agentAddress || !destination || !assetContract || !amountHuman) {
    return res.status(400).json({ error: 'Missing parameters.' });
  }

  try {
    const ownerKeypair = Keypair.fromSecret(ownerSecret);
    const sourceAccount = await getAccount(ownerKeypair.publicKey());

    const routerContract = new Contract(contractAddresses.router);

    const actionRequest = {
      owner: ownerAddress,
      agent: agentAddress,
      destination: destination,
      asset_contract: assetContract,
      amount_human: amountHuman,
    };

    const actionRequestScVal = buildActionRequestScVal(actionRequest as any, ownerAddress);

    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        routerContract.call(
          'execute_action',
          new Address(contractAddresses.registry).toScVal(),
          actionRequestScVal
        )
      )
      .setTimeout(30)
      .build();

    const result = await signAndSubmitTx(tx, [ownerKeypair]);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Execute Action failed:', err);
    res.status(500).json({ error: err.message || 'Execution failed' });
  }
});

// 5. Query Registry (Read-only calls list_agents)
app.get('/api/registry/:owner/agents', async (req, res) => {
  const { owner } = req.params;

  try {
    const contract = new Contract(contractAddresses.registry);
    
    // Create a dummy account for simulating read-only calls
    // We can use any random public key as source just to simulate
    const dummyKeypair = Keypair.random();
    const dummyAccount = new Account(dummyKeypair.publicKey(), '0');
    const tx = new TransactionBuilder(
      dummyAccount,
      {
        fee: BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
      }
    )
      .addOperation(
        contract.call('list_agents', new Address(owner).toScVal())
      )
      .setTimeout(30)
      .build();

    const simRes = await server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(simRes)) {
      return res.status(400).json({ error: 'Simulation failed: ' + JSON.stringify(simRes) });
    }

    const result = scValToNative(simRes.result!.retval);
    res.json({ agents: result });
  } catch (err: any) {
    console.error('List Agents failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Query Registry (Read-only calls get_policy_contract)
app.get('/api/registry/:owner/policy-contract', async (req, res) => {
  const { owner } = req.params;

  try {
    const contract = new Contract(contractAddresses.registry);
    const dummyKeypair = Keypair.random();
    const dummyAccount = new Account(dummyKeypair.publicKey(), '0');
    
    // Build call
    const tx = new TransactionBuilder(
      dummyAccount,
      {
        fee: BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
      }
    )
      .addOperation(
        contract.call('get_policy_contract', new Address(owner).toScVal())
      )
      .setTimeout(30)
      .build();

    const simRes = await server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(simRes)) {
      return res.status(400).json({ error: 'Simulation failed' });
    }

    const result = scValToNative(simRes.result!.retval);
    res.json({ policyContract: result });
  } catch (err: any) {
    console.error('Get Policy Contract failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// 7. Query Registry (Read-only calls is_authorized_agent)
app.get('/api/registry/:owner/is-authorized/:agent', async (req, res) => {
  const { owner, agent } = req.params;

  try {
    const contract = new Contract(contractAddresses.registry);
    const dummyKeypair = Keypair.random();
    const dummyAccount = new Account(dummyKeypair.publicKey(), '0');
    
    const tx = new TransactionBuilder(
      dummyAccount,
      {
        fee: BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
      }
    )
      .addOperation(
        contract.call('is_authorized_agent', new Address(owner).toScVal(), new Address(agent).toScVal())
      )
      .setTimeout(30)
      .build();

    const simRes = await server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(simRes)) {
      return res.status(400).json({ error: 'Simulation failed' });
    }

    const result = scValToNative(simRes.result!.retval);
    res.json({ isAuthorized: result });
  } catch (err: any) {
    console.error('Is Authorized Agent failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// 8. Get contract events from RPC
app.get('/api/events', async (req, res) => {
  try {
    const currentLedger = (await server.getLatestLedger()).sequence;
    const startLedger = Math.max(1, currentLedger - 10000); // look back ~10000 ledgers (approx 14 hours)
    
    const response = await server.getEvents({
      startLedger,
      filters: [
        {
          contractIds: [
            contractAddresses.registry,
            contractAddresses.policy,
            contractAddresses.router,
          ].filter(Boolean),
        },
      ],
      limit: 50,
    });

    const parsedEvents = response.events.map((evt) => {
      let topics: any[] = [];
      let data: any = null;
      try {
        topics = evt.topic.map((t) => scValToNative(t));
        data = scValToNative(evt.value);
      } catch (e) {
        // Leave unparsed if conversion fails
      }
      return {
        id: evt.id,
        contractId: evt.contractId,
        ledger: evt.ledger,
        topics,
        data,
        type: evt.type,
      };
    });

    res.json({ events: parsedEvents });
  } catch (err: any) {
    console.error('Get Events failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// 9. Friendbot helper to fund keypairs
app.post('/api/fund', async (req, res) => {
  const { address } = req.body;
  if (!address) {
    return res.status(400).json({ error: 'Missing address parameter.' });
  }
  try {
    const fetchResponse = await fetch(`https://friendbot.stellar.org?addr=${address}`);
    if (!fetchResponse.ok) {
      throw new Error(`Friendbot returned error status: ${fetchResponse.status}`);
    }
    const data = await fetchResponse.json();
    res.json({ success: true, data });
  } catch (err: any) {
    console.error('Funding failed:', err);
    res.status(500).json({ error: err.message || 'Funding failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Relay service listening on port ${PORT}`);
});
