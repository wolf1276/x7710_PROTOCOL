import { useState, useEffect } from 'react';
import './App.css';

const API_BASE_URL = 'http://localhost:3001';

// Default mock USDC address on Stellar Testnet for testing
const MOCK_USDC_CONTRACT = 'CDLZFC3SY4K75QNOXAN7GZ7G6GXYNS27JXZOTTYQXLZEQ2UWQFKZW6';

function App() {
  // Config
  const [config, setConfig] = useState({
    registry: '',
    policy: '',
    router: '',
    network: 'testnet',
  });
  const [loadingConfig, setLoadingConfig] = useState(true);

  // Owner & Agent keys
  const [ownerKeys, setOwnerKeys] = useState({ publicKey: '', secret: '' });
  const [agentKeys, setAgentKeys] = useState({ publicKey: '', secret: '' });
  const [fundingOwner, setFundingOwner] = useState(false);
  const [fundingAgent, setFundingAgent] = useState(false);
  const [ownerBalance, setOwnerBalance] = useState('0');
  const [agentBalance, setAgentBalance] = useState('0');

  // Protocol state
  const [registeredPolicy, setRegisteredPolicy] = useState('');
  const [registeredAgents, setRegisteredAgents] = useState([]);
  const [checkingRegistry, setCheckingRegistry] = useState(false);

  // Form states
  const [registerPolicyAddr, setRegisterPolicyAddr] = useState('');
  const [registerAgentsList, setRegisterAgentsList] = useState('');
  const [submittingRegister, setSubmittingRegister] = useState(false);

  const [policyMaxSpend, setPolicyMaxSpend] = useState('1000');
  const [policyMaxDaily, setPolicyMaxDaily] = useState('5000');
  const [policyAllowedAssets, setPolicyAllowedAssets] = useState('USDC');
  const [policyExpiryLedger, setPolicyExpiryLedger] = useState('5000000'); // large future ledger
  const [submittingPolicy, setSubmittingPolicy] = useState(false);

  const [actionDestination, setActionDestination] = useState('');
  const [actionAssetContract, setActionAssetContract] = useState(MOCK_USDC_CONTRACT);
  const [actionAmount, setActionAmount] = useState('250');
  const [submittingAction, setSubmittingAction] = useState(false);

  // Events & logs
  const [events, setEvents] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Messages
  const [statusMsg, setStatusMsg] = useState({ text: '', type: 'info' });

  // Add custom log
  const addLog = (message, type = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [{ time, message, type }, ...prev]);
  };

  const showStatus = (text, type = 'info') => {
    setStatusMsg({ text, type });
    addLog(text, type);
    setTimeout(() => {
      setStatusMsg({ text: '', type: 'info' });
    }, 6000);
  };

  // Load configuration
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/config`)
      .then((res) => res.json())
      .then((data) => {
        setConfig(data);
        setRegisterPolicyAddr(data.policy || '');
        setLoadingConfig(false);
        addLog('Loaded protocol configuration from relay.', 'success');
      })
      .catch((err) => {
        console.error(err);
        setLoadingConfig(false);
        showStatus('Failed to load contract configuration from relay. Make sure the relay server is running on port 3001.', 'error');
      });
      
    // Initial events load
    fetchEvents();
    const interval = setInterval(fetchEvents, 10000);
    return () => clearInterval(interval);
  }, []);

  // Fetch events
  const fetchEvents = () => {
    setLoadingEvents(true);
    fetch(`${API_BASE_URL}/api/events`)
      .then((res) => res.json())
      .then((data) => {
        if (data.events) {
          setEvents(data.events);
        }
        setLoadingEvents(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadingEvents(false);
      });
  };

  // Generate Owner Keypair
  const generateOwnerKeys = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/generate-keypair`);
      const data = await res.json();
      setOwnerKeys(data);
      addLog(`Generated new Owner keys. Public Key: ${data.publicKey}`, 'info');
    } catch (err) {
      showStatus('Failed to generate Owner keys.', 'error');
    }
  };

  // Generate Agent Keypair
  const generateAgentKeys = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/generate-keypair`);
      const data = await res.json();
      setAgentKeys(data);
      setRegisterAgentsList(data.publicKey);
      addLog(`Generated new Agent keys. Public Key: ${data.publicKey}`, 'info');
    } catch (err) {
      showStatus('Failed to generate Agent keys.', 'error');
    }
  };

  // Fund Address via Friendbot
  const fundAddress = async (address, isOwner) => {
    if (isOwner) setFundingOwner(true);
    else setFundingAgent(true);

    try {
      addLog(`Requesting Friendbot XLM funds for ${isOwner ? 'Owner' : 'Agent'} address...`, 'info');
      const res = await fetch(`${API_BASE_URL}/api/fund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (data.success) {
        showStatus(`${isOwner ? 'Owner' : 'Agent'} address successfully funded via Friendbot!`, 'success');
        if (isOwner) {
          setOwnerBalance('10000 XLM'); // Friendbot usually gives 10,000 XLM
        } else {
          setAgentBalance('10000 XLM');
        }
      } else {
        throw new Error(data.error || 'Funding failed');
      }
    } catch (err) {
      showStatus(`Funding failed: ${err.message}`, 'error');
    } finally {
      if (isOwner) setFundingOwner(false);
      else setFundingAgent(false);
    }
  };

  // Check Registry status for Owner
  const checkRegistry = async () => {
    if (!ownerKeys.publicKey) {
      showStatus('Please generate or set Owner public key first.', 'error');
      return;
    }
    setCheckingRegistry(true);
    try {
      addLog(`Fetching Registry mappings for Owner: ${ownerKeys.publicKey}...`, 'info');
      
      const policyRes = await fetch(`${API_BASE_URL}/api/registry/${ownerKeys.publicKey}/policy-contract`);
      const policyData = await policyRes.json();
      
      const agentsRes = await fetch(`${API_BASE_URL}/api/registry/${ownerKeys.publicKey}/agents`);
      const agentsData = await agentsRes.json();

      if (policyData.policyContract) {
        setRegisteredPolicy(policyData.policyContract);
        addLog(`Registry policy contract found: ${policyData.policyContract}`, 'success');
      } else {
        setRegisteredPolicy('None');
      }

      if (agentsData.agents) {
        setRegisteredAgents(agentsData.agents);
        addLog(`Registry agents found: ${agentsData.agents.join(', ')}`, 'success');
      } else {
        setRegisteredAgents([]);
      }
    } catch (err) {
      setRegisteredPolicy('Not Registered / Error');
      setRegisteredAgents([]);
      showStatus('Owner is not registered or registry fetch failed.', 'warning');
    } finally {
      setCheckingRegistry(false);
    }
  };

  // Register Account
  const handleRegister = async (e) => {
    e.preventDefault();
    if (!ownerKeys.secret) {
      showStatus('Owner Secret Key is required to authorize account registration.', 'error');
      return;
    }
    if (!registerPolicyAddr) {
      showStatus('Policy Contract address is required.', 'error');
      return;
    }
    const agents = registerAgentsList.split(',').map(a => a.trim()).filter(Boolean);
    if (agents.length === 0) {
      showStatus('At least one agent address must be authorized.', 'error');
      return;
    }

    setSubmittingRegister(true);
    try {
      addLog('Submitting Account Registration transaction to Stellar testnet...', 'info');
      const res = await fetch(`${API_BASE_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerSecret: ownerKeys.secret,
          policyAddress: registerPolicyAddr,
          agents,
        }),
      });

      const data = await res.json();
      if (data.success) {
        showStatus(`Account registered successfully! Tx Hash: ${data.hash.substring(0, 10)}...`, 'success');
        setRegisteredPolicy(registerPolicyAddr);
        setRegisteredAgents(agents);
        fetchEvents();
      } else {
        throw new Error(data.error || 'Registration failed');
      }
    } catch (err) {
      showStatus(`Registration failed: ${err.message}`, 'error');
    } finally {
      setSubmittingRegister(false);
    }
  };

  // Set Spending Policy
  const handleSetPolicy = async (e) => {
    e.preventDefault();
    if (!ownerKeys.secret) {
      showStatus('Owner Secret Key is required to set spending policy.', 'error');
      return;
    }
    setSubmittingPolicy(true);
    try {
      addLog('Submitting Set Policy transaction to Stellar testnet...', 'info');
      const res = await fetch(`${API_BASE_URL}/api/set-policy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerSecret: ownerKeys.secret,
          maxSpendPerAction: policyMaxSpend,
          maxDailySpend: policyMaxDaily,
          allowedAssets: policyAllowedAssets.split(',').map(a => a.trim()).filter(Boolean),
          expiryLedger: policyExpiryLedger,
        }),
      });

      const data = await res.json();
      if (data.success) {
        showStatus(`Policy config updated successfully! Tx Hash: ${data.hash.substring(0, 10)}...`, 'success');
        fetchEvents();
      } else {
        throw new Error(data.error || 'Policy update failed');
      }
    } catch (err) {
      showStatus(`Policy update failed: ${err.message}`, 'error');
    } finally {
      setSubmittingPolicy(false);
    }
  };

  // Execute Action via Router
  const handleExecuteAction = async (e) => {
    e.preventDefault();
    if (!ownerKeys.publicKey || !ownerKeys.secret) {
      showStatus('Owner keys are required to execute router actions.', 'error');
      return;
    }
    if (!agentKeys.publicKey) {
      showStatus('Agent Address is required.', 'error');
      return;
    }
    if (!actionDestination) {
      showStatus('Destination address is required.', 'error');
      return;
    }

    setSubmittingAction(true);
    try {
      addLog(`Agent ${agentKeys.publicKey} proposing transfer of ${actionAmount} USDC...`, 'info');
      const res = await fetch(`${API_BASE_URL}/api/execute-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerAddress: ownerKeys.publicKey,
          ownerSecret: ownerKeys.secret,
          agentAddress: agentKeys.publicKey,
          destination: actionDestination,
          assetContract: actionAssetContract,
          amountHuman: actionAmount,
        }),
      });

      const data = await res.json();
      if (data.success) {
        showStatus(`Router action executed successfully! Transfer completed. Tx Hash: ${data.hash.substring(0, 10)}...`, 'success');
        fetchEvents();
      } else {
        throw new Error(data.error || 'Router execution failed');
      }
    } catch (err) {
      showStatus(`Router execution failed: ${err.message}`, 'error');
    } finally {
      setSubmittingAction(false);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-logo">
          <span className="logo-icon">▲</span>
          <h1>X7710 PROTOCOL</h1>
          <span className="badge">Soroban SandBox</span>
        </div>
        <p className="header-desc">
          State-of-the-art Owner-to-Agent authorization registry, spending policy engine, and atomic execution router.
        </p>
      </header>

      {/* Global Status Banner */}
      {statusMsg.text && (
        <div className={`status-banner banner-${statusMsg.type}`}>
          <span className="banner-icon">
            {statusMsg.type === 'success' && '✓'}
            {statusMsg.type === 'error' && '⚡'}
            {statusMsg.type === 'warning' && '⚠'}
            {statusMsg.type === 'info' && 'ℹ'}
          </span>
          <span className="banner-text">{statusMsg.text}</span>
        </div>
      )}

      {/* Overview Cards */}
      <section className="config-overview grid-3">
        <div className="glass-card config-card">
          <h3>Registry Contract</h3>
          <p className="contract-address">{config.registry || 'Not Deployed'}</p>
          <span className="card-tag">Account Registry</span>
        </div>
        <div className="glass-card config-card">
          <h3>Policy Engine Contract</h3>
          <p className="contract-address">{config.policy || 'Not Deployed'}</p>
          <span className="card-tag font-orange">Policy Engine</span>
        </div>
        <div className="glass-card config-card">
          <h3>Execution Router Contract</h3>
          <p className="contract-address">{config.router || 'Not Deployed'}</p>
          <span className="card-tag font-teal">Execution Router</span>
        </div>
      </section>

      <div className="main-layout grid-1-2">
        {/* Left Side: Setup & Keys */}
        <aside className="sidebar flex-col">
          {/* Step 1: Identity Manager */}
          <div className="glass-card sidebar-section">
            <h2 className="section-title"><span className="step-num">1</span> Wallet Identities</h2>
            
            {/* Owner Section */}
            <div className="wallet-box">
              <div className="wallet-header">
                <h4>Owner Account (Vault)</h4>
                <button className="btn-small btn-secondary" onClick={generateOwnerKeys}>Generate</button>
              </div>
              <div className="input-group-vertical">
                <label>Public Key (Address)</label>
                <input 
                  type="text" 
                  value={ownerKeys.publicKey} 
                  placeholder="G..." 
                  onChange={(e) => setOwnerKeys({ ...ownerKeys, publicKey: e.target.value })}
                />
                <label>Secret Key (Private)</label>
                <input 
                  type="password" 
                  value={ownerKeys.secret} 
                  placeholder="S..." 
                  onChange={(e) => setOwnerKeys({ ...ownerKeys, secret: e.target.value })}
                />
              </div>
              {ownerKeys.publicKey && (
                <div className="wallet-actions flex-row justify-between align-center">
                  <span className="balance-badge">Balance: {ownerBalance}</span>
                  <button 
                    className="btn-link" 
                    onClick={() => fundAddress(ownerKeys.publicKey, true)}
                    disabled={fundingOwner}
                  >
                    {fundingOwner ? 'Funding...' : 'Fund via Friendbot'}
                  </button>
                </div>
              )}
            </div>

            {/* Agent Section */}
            <div className="wallet-box margin-top">
              <div className="wallet-header">
                <h4>Agent Account (Copilot)</h4>
                <button className="btn-small btn-secondary" onClick={generateAgentKeys}>Generate</button>
              </div>
              <div className="input-group-vertical">
                <label>Public Key (Address)</label>
                <input 
                  type="text" 
                  value={agentKeys.publicKey} 
                  placeholder="G..." 
                  onChange={(e) => setAgentKeys({ ...agentKeys, publicKey: e.target.value })}
                />
                <label>Secret Key (Private)</label>
                <input 
                  type="password" 
                  value={agentKeys.secret} 
                  placeholder="S..." 
                  onChange={(e) => setAgentKeys({ ...agentKeys, secret: e.target.value })}
                />
              </div>
              {agentKeys.publicKey && (
                <div className="wallet-actions flex-row justify-between align-center">
                  <span className="balance-badge">Balance: {agentBalance}</span>
                  <button 
                    className="btn-link" 
                    onClick={() => fundAddress(agentKeys.publicKey, false)}
                    disabled={fundingAgent}
                  >
                    {fundingAgent ? 'Funding...' : 'Fund via Friendbot'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Registry Status */}
          <div className="glass-card sidebar-section">
            <div className="flex-row justify-between align-center">
              <h2 className="section-title">On-Chain Registry Status</h2>
              <button className="btn-small btn-primary" onClick={checkRegistry} disabled={checkingRegistry}>
                {checkingRegistry ? 'Fetching...' : 'Query'}
              </button>
            </div>
            <div className="status-list margin-top-small">
              <div className="status-item flex-row justify-between">
                <span className="status-label">Policy Contract:</span>
                <span className="status-value">{registeredPolicy || 'Unchecked'}</span>
              </div>
              <div className="status-item">
                <span className="status-label">Authorized Agents:</span>
                <div className="status-agents-list">
                  {registeredAgents.length > 0 ? (
                    registeredAgents.map((agent, i) => (
                      <span key={i} className="agent-tag font-teal">{agent.substring(0, 12)}...</span>
                    ))
                  ) : (
                    <span className="status-value-empty">No Authorized Agents</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Console / Audit Log */}
          <div className="glass-card sidebar-section flex-grow-card console-section">
            <h2 className="section-title">Local Dev Audit Trail</h2>
            <div className="console-box flex-grow">
              {logs.length > 0 ? (
                logs.map((log, i) => (
                  <div key={i} className={`console-line font-${log.type}`}>
                    <span className="console-time">[{log.time}]</span> {log.message}
                  </div>
                ))
              ) : (
                <div className="console-line-empty">Logs will appear here as transactions execute...</div>
              )}
            </div>
          </div>
        </aside>

        {/* Right Side: Step Forms */}
        <main className="content flex-col gap-medium">
          {/* Step 2: Registry Settings */}
          <section className="glass-card">
            <h2 className="section-title"><span className="step-num bg-orange">2</span> Contract Setup: Registry Mapping</h2>
            <p className="step-desc">
              Bind the Owner's account to a secure Policy Engine contract and grant execution permissions to specific Agents.
            </p>
            <form onSubmit={handleRegister} className="form-grid">
              <div className="input-group">
                <label>Policy Engine Address</label>
                <input 
                  type="text" 
                  value={registerPolicyAddr} 
                  onChange={(e) => setRegisterPolicyAddr(e.target.value)}
                  placeholder="C..." 
                />
              </div>
              <div className="input-group">
                <label>Authorized Agents (comma-separated)</label>
                <input 
                  type="text" 
                  value={registerAgentsList} 
                  onChange={(e) => setRegisterAgentsList(e.target.value)}
                  placeholder="Agent 1 Address, Agent 2 Address" 
                />
              </div>
              <div className="form-submit span-all">
                <button type="submit" className="btn-large btn-submit" disabled={submittingRegister}>
                  {submittingRegister ? 'Submitting Registry Transaction...' : 'Register Agent Mappings'}
                </button>
              </div>
            </form>
          </section>

          {/* Step 3: Policy Manager */}
          <section className="glass-card">
            <h2 className="section-title"><span className="step-num bg-pink">3</span> Configure Constraints: Spending Policy</h2>
            <p className="step-desc">
              Define the spending bounds enforced by the Policy Engine. If an Agent violates any rule, the Execution Router automatically reverts the payment.
            </p>
            <form onSubmit={handleSetPolicy} className="form-grid grid-3-cols">
              <div className="input-group">
                <label>Max Spend Per Action (USDC)</label>
                <input 
                  type="number" 
                  value={policyMaxSpend} 
                  onChange={(e) => setPolicyMaxSpend(e.target.value)} 
                />
              </div>
              <div className="input-group">
                <label>Max Daily Budget (USDC)</label>
                <input 
                  type="number" 
                  value={policyMaxDaily} 
                  onChange={(e) => setPolicyMaxDaily(e.target.value)} 
                />
              </div>
              <div className="input-group">
                <label>Allowed Assets</label>
                <input 
                  type="text" 
                  value={policyAllowedAssets} 
                  onChange={(e) => setPolicyAllowedAssets(e.target.value)} 
                />
              </div>
              <div className="input-group span-all">
                <label>Policy Expiry (Ledger Sequence)</label>
                <input 
                  type="number" 
                  value={policyExpiryLedger} 
                  onChange={(e) => setPolicyExpiryLedger(e.target.value)} 
                />
              </div>
              <div className="form-submit span-all">
                <button type="submit" className="btn-large btn-submit" disabled={submittingPolicy}>
                  {submittingPolicy ? 'Updating Policy Settings...' : 'Set Active Spending Policy'}
                </button>
              </div>
            </form>
          </section>

          {/* Step 4: Execution Router */}
          <section className="glass-card">
            <h2 className="section-title"><span className="step-num bg-teal">4</span> Execute Action: Trigger Atomic Routing</h2>
            <p className="step-desc">
              Trigger a payment on behalf of the Owner. The Router verifies Agent permission, checks the Policy Engine limits, and conducts the SEP-41 token transfer.
            </p>
            <form onSubmit={handleExecuteAction} className="form-grid">
              <div className="input-group">
                <label>Destination Address (Recipient)</label>
                <input 
                  type="text" 
                  value={actionDestination} 
                  onChange={(e) => setActionDestination(e.target.value)}
                  placeholder="G..." 
                />
              </div>
              <div className="input-group">
                <label>Asset Contract (SEP-41 Token Address)</label>
                <input 
                  type="text" 
                  value={actionAssetContract} 
                  onChange={(e) => setActionAssetContract(e.target.value)}
                  placeholder="C..." 
                />
              </div>
              <div className="input-group">
                <label>Transfer Amount (USDC)</label>
                <input 
                  type="number" 
                  value={actionAmount} 
                  onChange={(e) => setActionAmount(e.target.value)} 
                />
              </div>
              <div className="form-submit span-all">
                <button type="submit" className="btn-large btn-teal btn-submit" disabled={submittingAction}>
                  {submittingAction ? 'Atomic Verification & Transfer Processing...' : 'Submit Action via Router'}
                </button>
              </div>
            </form>
          </section>

          {/* Event Stream Log */}
          <section className="glass-card event-section">
            <div className="flex-row justify-between align-center">
              <h2 className="section-title">Live Soroban Event Subscriptions</h2>
              <button className="btn-small btn-secondary" onClick={fetchEvents} disabled={loadingEvents}>
                {loadingEvents ? 'Syncing...' : 'Sync Events'}
              </button>
            </div>
            <p className="step-desc">
              Real-time ledger events filtered across the Account Registry, Policy Engine, and Execution Router contract ids.
            </p>
            <div className="table-box margin-top-small">
              <table>
                <thead>
                  <tr>
                    <th>Ledger</th>
                    <th>Contract</th>
                    <th>Event Topic</th>
                    <th>Event Data Payload</th>
                  </tr>
                </thead>
                <tbody>
                  {events.length > 0 ? (
                    events.map((evt, i) => (
                      <tr key={i}>
                        <td className="font-mono">{evt.ledger}</td>
                        <td className="font-mono font-small truncate" title={evt.contractId}>
                          {evt.contractId ? `${evt.contractId.substring(0, 8)}...` : 'Unknown'}
                        </td>
                        <td>
                          <span className={`event-topic-tag evt-${evt.topics[0]}`}>
                            {evt.topics[0] || 'Unknown'}
                          </span>
                        </td>
                        <td className="font-mono font-small truncate-large">
                          {JSON.stringify(evt.data)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="empty-row">No contract events found in recent ledgers.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;
