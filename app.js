const CONTRACT_ADDRESS = '0xBd214514bdDf69395f6cB69A26557c8C5F0612F5';
let contract = null;
let signer = null;
let userAddress = null;

async function loadABI() {
    try {
        const response = await fetch('abi_carbon.json');
        return await response.json();
    } catch (error) {
        showMessage('Failed to load ABI: ' + error.message, 'error');
        return null;
    }
}

async function connectWallet() {
    console.log('window.ethereum:', typeof window.ethereum);
    console.log('ethers:', typeof ethers);
    
    let ethereum = null;
    
    if (typeof window.ethereum !== 'undefined') {
        ethereum = window.ethereum;
    } else if (typeof window.web3 !== 'undefined' && window.web3.currentProvider) {
        ethereum = window.web3.currentProvider;
    } else {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        if (typeof window.ethereum !== 'undefined') {
            ethereum = window.ethereum;
        } else {
            showMetaMaskInstallGuide();
            return;
        }
    }
    
    if (typeof window.ethereum === 'undefined' && ethereum) {
        window.ethereum = ethereum;
    }
    
    if (!ethereum) {
        showMetaMaskInstallGuide();
        return;
    }
    
    if (typeof ethers === 'undefined') {
        const errorMsg = 'ethers.js not loaded';
        console.error('ethers.js is undefined');
        showMessage(errorMsg, 'error');
        alert('ethers.js failed to load');
        return;
    }
    
    try {
        console.log('Start connect MetaMask');
        showMessage('Connect to MetaMask', 'info');
        
        console.log('Request account access');
        const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
        console.log('Accounts received:', accounts);
        
        if (accounts.length === 0) {
            showMessage('No accounts received', 'error');
            return;
        }
        
        userAddress = accounts[0];
        console.log('Connected account:', userAddress);
        
        const provider = new ethers.providers.Web3Provider(ethereum);
        signer = provider.getSigner();
        
        showMessage('Loading contract ABI', 'info');
        const abi = await loadABI();
        
        if (!abi) {
            showMessage('Failed to load ABI', 'error');
            return;
        }
        
        contract = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
        console.log('Contract instance created');
        
        updateWalletUI();
        showMessage('Connected successful', 'success');
        
        await loadDashboard();
        await checkPermissions();
        await updateBatchPagePermissions();
        
        ethereum.on('accountsChanged', (accounts) => {
            if (accounts.length === 0) {
                disconnectWallet();
            } else {
                connectWallet();
            }
        });
        
        ethereum.on('chainChanged', () => {
            window.location.reload();
        });
        
    } catch (error) {
        console.error('Wallet connection error:', error);
        if (error.code === 4001) {
            showMessage('User rejected the connection', 'error');
        } else {
            showMessage('Failed to connect wallet: ' + error.message, 'error');
        }
    }
}

function disconnectWallet() {
    userAddress = null;
    signer = null;
    contract = null;
    const connectBtn = document.getElementById('connectBtn');
    const walletAddress = document.getElementById('walletAddress');
    if (connectBtn) connectBtn.style.display = 'block';
    if (walletAddress) walletAddress.style.display = 'none';
    const myBalances = document.getElementById('myBalances');
    const contractStatus = document.getElementById('contractStatus');
    if (myBalances) myBalances.innerHTML = '<p>Please connect wallet first...</p>';
    if (contractStatus) contractStatus.innerHTML = '<p>Please connect wallet first...</p>';
    
    showMessage('Disconnected', 'info');
}

function updateWalletUI() {
    const connectBtn = document.getElementById('connectBtn');
    const walletAddress = document.getElementById('walletAddress');
    const walletAddressText = document.getElementById('walletAddressText');
    if (connectBtn) connectBtn.style.display = 'none';
    if (walletAddress) walletAddress.style.display = 'flex';
    if (walletAddressText) walletAddressText.textContent = `Connected: ${formatAddress(userAddress)}`;
}

function formatAddress(address) {
    return address ? `${address.substring(0, 6)}...${address.substring(address.length - 4)}` : '';
}

function showMessage(message, type = 'info') {
    const messageEl = document.getElementById('message');
    if (messageEl) {
        messageEl.textContent = message;
        messageEl.className = `message ${type}`;
        messageEl.style.display = 'block';
        
        setTimeout(() => {
            messageEl.style.display = 'none';
        }, 5000);
    } else {
        console.log(`[${type}] ${message}`);
    }
}

function detectBrowser() {
    const ua = navigator.userAgent;
    if (ua.indexOf('Chrome') > -1 && ua.indexOf('Edg') === -1) return 'Chrome';
    if (ua.indexOf('Edg') > -1) return 'Edge';
    if (ua.indexOf('Firefox') > -1) return 'Firefox';
    if (ua.indexOf('Safari') > -1) return 'Safari';
    return 'Unknown';
}


function showMetaMaskInstallGuide() {
    const message = `
    MetaMask not detected
    `;
    
    showMessage('MetaMask not detected', 'error');
    console.error(message);
    
    const btn = document.getElementById('connectBtn');
    if (btn) {
        btn.textContent = 'MetaMask Not Detected and Click to Retry';
        btn.onclick = function() {
            console.log('Manual retry connection');
            if (typeof window.ethereum !== 'undefined') {
                console.log('✅ MetaMask detected now!');
                connectWallet();
            } else {
                showMessage('MetaMask not detected, please check extension is enabled', 'error');
            }
        };
    }
}

function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            const tabContent = document.getElementById(tab);
            if (tabContent) {
                tabContent.classList.add('active');
            }
            
            if (contract && userAddress) {
                if (tab === 'dashboard') {
                    loadDashboard();
                } else if (tab === 'batches') {
                    loadAllBatches();
                    updateBatchPagePermissions();
                } else if (tab === 'admin') {
                    checkPermissions();
                }
            }
        });
    });
}

async function updateBatchPagePermissions() {
    if (!contract || !userAddress) return;
    try {
        const owner = await contract.owner();
        const isOwner = userAddress.toLowerCase() === owner.toLowerCase();
        const isAuthorized = await contract.authorizedVerificationBodies(userAddress);
        const createBatchCard = document.querySelector('#batches .card:first-child');
        if (createBatchCard) {
            let permissionHtml = '<p><small>';
            if (isAuthorized) {
                permissionHtml += '<span style="color: #28a745;">✅ You are authorized as verification body, you can create batches</span>';
            } else if (isOwner) {
                permissionHtml += '<span style="color: #ffc107;">⚠️ You need to authorize yourself as verification body first</span>';
                permissionHtml += '<br><button onclick="quickAuthorizeSelf()" class="btn btn-warning" style="margin-top: 10px; font-size: 12px; padding: 6px 12px;">Quick Authorize Self</button>';
            } else {
                permissionHtml += '<span style="color: #dc3545;">❌ You are not an authorized verification body</span>';
                permissionHtml += '<br><small>Please contact contract owner to authorize your account</small>';
            }
            permissionHtml += '</small></p>';
            const existingPermission = createBatchCard.querySelector('.permission-status');
            if (existingPermission) {
                existingPermission.innerHTML = permissionHtml;
            } else {
                const permissionDiv = document.createElement('div');
                permissionDiv.className = 'permission-status';
                permissionDiv.innerHTML = permissionHtml;
                const firstP = createBatchCard.querySelector('p');
                if (firstP) {
                    firstP.insertAdjacentElement('afterend', permissionDiv);
                }
            }
        }
    } catch (error) {
        console.error('Failed to update permission status:', error);
    }
}

async function quickAuthorizeSelf() {
    if (!contract || !userAddress) {
        showMessage('Please connect wallet', 'error');
        return;
    }
    try {
        const owner = await contract.owner();
        const isOwner = userAddress.toLowerCase() === owner.toLowerCase();
        if (!isOwner) {
            showMessage('Only contract owner can authorize verification', 'error');
            return;
        }
        const isAuthorized = await contract.authorizedVerificationBodies(userAddress);
        if (isAuthorized) {
            showMessage('You are already authorized verification body', 'info');
            updateBatchPagePermissions();
            return;
        }
        
        if (!confirm('Are you sure to authorize the current account as verification body?')) return;
        
        showMessage('Authorizing', 'info');
        const tx = await contract.authorizeVerificationBody(userAddress);
        showMessage('Transaction submitted', 'info');
        await tx.wait();
        showMessage('Authorization successful. You can now create batches', 'success');
        updateBatchPagePermissions();
        checkPermissions();
    } catch (error) {
        showMessage('Authorization failed: ' + error.message, 'error');
    }
}

async function loadDashboard() {
    if (!contract || !userAddress) return;
    try {
        await loadMyBalances();
        const isPaused = await contract.paused();
        const owner = await contract.owner();
        const nextBatchId = await contract.nextBatchId();
        
        document.getElementById('contractStatus').innerHTML = `
            <p><strong>Contract Status:</strong> ${isPaused ? '⛔ Paused' : '✅ Running'}</p>
            <p><strong>Contract Owner:</strong> ${formatAddress(owner)}</p>
            <p><strong>Next Batch ID:</strong> ${nextBatchId.toString()}</p>
            <p><strong>Contract Address:</strong> ${formatAddress(CONTRACT_ADDRESS)}</p>
        `;
    } catch (error) {
        showMessage('Failed to load dashboard: ' + error.message, 'error');
    }
}

async function loadMyBalances() {
    if (!contract || !userAddress) return;
    try {
        const nextBatchId = await contract.nextBatchId();
        const balances = [];
        for (let i = 1; i < nextBatchId.toNumber(); i++) {
            try {
                const balance = await contract.balanceOf(userAddress, i);
                if (balance.gt(0)) {
                    const batch = await contract.getCarbonCreditBatch(i);
                    balances.push({
                        batchId: i,
                        balance: balance.toString(),
                        projectName: batch.projectName
                    });
                }
            } catch (e) {
                // pass
            }
        }
        
        const balancesEl = document.getElementById('myBalances');
        if (balances.length === 0) {
            balancesEl.innerHTML = '<p>No balance</p>';
        } else {
            balancesEl.innerHTML = balances.map(b => `
                <div class="balance-item">
                    <strong>Batch ${b.batchId}:</strong> ${b.balance} tons CO₂
                    <br><small>${b.projectName}</small>
                </div>
            `).join('');
        }
    } catch (error) {
        showMessage('Failed to load balances: ' + error.message, 'error');
    }
}

async function queryBatch() {
    if (!contract) {
        showMessage('Please connect wallet', 'error');
        return;
    }
    const batchId = document.getElementById('queryBatchId').value;
    if (!batchId) {
        showMessage('Please enter batch ID', 'error');
        return;
    }
    try {
        const batch = await contract.getCarbonCreditBatch(batchId);
        const remaining = await contract.getBatchRemainingSupply(batchId);
        const totalMinted = await contract.totalMintedPerBatch(batchId);
        const isAuthorized = await contract.authorizedVerificationBodies(userAddress);
        const expiryDate = batch.expiryDate.toString() === '0' 
            ? 'Permanent' 
            : new Date(batch.expiryDate.toNumber() * 1000).toLocaleString();
        
        document.getElementById('batchInfo').innerHTML = `
            <div class="batch-details">
                <h4>Batch #${batch.batchId}</h4>
                <p><strong>Project Name:</strong> ${batch.projectName}</p>
                <p><strong>Verification Body:</strong> ${formatAddress(batch.verificationBody)}</p>
                <p><strong>Total Emission Reduction:</strong> ${batch.totalEmissionReduction.toString()} tons CO₂</p>
                <p><strong>Minted:</strong> ${totalMinted.toString()} tons CO₂</p>
                <p><strong>Remaining to Mint:</strong> ${remaining.toString()} tons CO₂</p>
                <p><strong>Retired:</strong> ${batch.burnedAmount.toString()} tons CO₂</p>
                <p><strong>Issued Date:</strong> ${new Date(batch.issuedDate.toNumber() * 1000).toLocaleString()}</p>
                <p><strong>Expiry Date:</strong> ${expiryDate}</p>
                <p><strong>Verification Status:</strong> ${batch.isVerified ? '✅ Verified' : '❌ Not Verified'}</p>
                <p><strong>Batch Hash:</strong> ${batch.verificationDocHash}</p>
            </div>
        `;
    } catch (error) {
        showMessage('Failed to query batch: ' + error.message, 'error');
        document.getElementById('batchInfo').innerHTML = '<p>Batch does not exist or query failed</p>';
    }
}

async function createBatch() {
    if (!contract || !userAddress) {
        showMessage('Please connect wallet first', 'error');
        return;
    }
    const projectName = document.getElementById('projectName').value;
    const totalEmissionReduction = document.getElementById('totalEmissionReduction').value;
    const expiryDate = document.getElementById('expiryDate').value || '0';
    const verificationDocHash = document.getElementById('verificationDocHash').value;
    if (!projectName || !totalEmissionReduction || !verificationDocHash) {
        showMessage('Please fill in all required fields', 'error');
        return;
    }
    
    try {
        const isAuthorized = await contract.authorizedVerificationBodies(userAddress);
        if (!isAuthorized) {
            const owner = await contract.owner();
            const isOwner = userAddress.toLowerCase() === owner.toLowerCase();
            let errorMsg = '❌ Current account is not an authorized verification body!\n\n';
            if (isOwner) {
                errorMsg += 'Solution:\n';
                errorMsg += '1. Switch to "Admin" tab\n';
                errorMsg += '2. Enter your address in "Authorize Verification Body": ' + userAddress + '\n';
                errorMsg += '3. Click "Authorize" button\n';
                errorMsg += '4. After successful authorization, return to this page to create batch';
            } else {
                errorMsg += 'Solution:\n';
                errorMsg += 'Please contact contract owner (' + formatAddress(owner) + ') to authorize your account as verification body.\n';
                errorMsg += 'Or switch to "Admin" tab to check permission status.';
            }
            alert(errorMsg);
            showMessage('Insufficient permissions: requires authorized verification body permission', 'error');
            return;
        }
    } catch (error) {
        showMessage('Failed to check permissions: ' + error.message, 'error');
        return;
    }
    
    try {
        showMessage('Creating batch', 'info');
        const tx = await contract.createCarbonCreditBatch(
            projectName,
            ethers.utils.parseUnits(totalEmissionReduction, 0),
            expiryDate,
            verificationDocHash
        );
        showMessage('Transaction submitted, waiting for confirmation', 'info');
        await tx.wait();
        showMessage('Batch created successfully', 'success');
        document.getElementById('projectName').value = '';
        document.getElementById('totalEmissionReduction').value = '';
        document.getElementById('expiryDate').value = '';
        document.getElementById('verificationDocHash').value = '';
        loadAllBatches();
    } catch (error) {
        let errorMsg = error.message;
        if (errorMsg.includes('Not authorized verification body') || errorMsg.includes('Not authorized')) {
            errorMsg = 'Insufficient permissions: current account is not an authorized verification body. Please authorize your account in "Admin" tab first.';
        }
        showMessage('Failed to create batch: ' + errorMsg, 'error');
    }
}

async function verifyBatch() {
    if (!contract || !userAddress) {
        showMessage('Please connect wallet first', 'error');
        return;
    }
    
    const batchId = document.getElementById('verifyBatchId').value;
    if (!batchId) {
        showMessage('Please enter batch ID', 'error');
        return;
    }
    
    try {
        const batch = await contract.getCarbonCreditBatch(batchId);
        if (batch.verificationBody.toLowerCase() !== userAddress.toLowerCase()) {
            showMessage('Only batch creator can verify this batch', 'error');
            return;
        }
        
        if (batch.isVerified) {
            showMessage('This batch is already verified', 'info');
            return;
        }
        
        showMessage('Verifying batch...', 'info');
        const tx = await contract.verifyCarbonCreditBatch(batchId);
        showMessage('Transaction submitted, waiting for confirmation...', 'info');
        await tx.wait();
        showMessage('Batch verified successfully', 'success');
        document.getElementById('verifyBatchId').value = '';
        loadAllBatches();
    } catch (error) {
        let errorMsg = error.message;
        if (errorMsg.includes('Only batch creator can verify') || errorMsg.includes('Not authorized')) {
            errorMsg = 'Only batch creator can verify this batch';
        }
        showMessage('Failed to verify batch: ' + errorMsg, 'error');
    }
}

async function loadAllBatches() {
    if (!contract) return;
    try {
        const nextBatchId = await contract.nextBatchId();
        const batches = [];
        for (let i = 1; i < nextBatchId.toNumber(); i++) {
            try {
                const batch = await contract.getCarbonCreditBatch(i);
                const totalMinted = await contract.totalMintedPerBatch(i);
                const remaining = await contract.getBatchRemainingSupply(i);
                
                batches.push({
                    ...batch,
                    totalMinted: totalMinted.toString(),
                    remaining: remaining.toString()
                });
            } catch (e) {
                // pass
            }
        }
        const batchesEl = document.getElementById('allBatches');
        if (batches.length === 0) {
            batchesEl.innerHTML = '<p>No batches</p>';
        } else {
            batchesEl.innerHTML = batches.map(b => {
                const expiryDate = b.expiryDate.toString() === '0' 
                    ? 'Permanent' 
                    : new Date(b.expiryDate.toNumber() * 1000).toLocaleString();
                
                return `
                    <div class="batch-card">
                        <h4>Batch #${b.batchId}: ${b.projectName}</h4>
                        <p><strong>Status:</strong> ${b.isVerified ? '✅ Verified' : '❌ Not Verified'}</p>
                        <p><strong>Total Emission Reduction:</strong> ${b.totalEmissionReduction.toString()} tons CO₂</p>
                        <p><strong>Minted:</strong> ${b.totalMinted} tons CO₂</p>
                        <p><strong>Remaining:</strong> ${b.remaining} tons CO₂</p>
                        <p><strong>Retired:</strong> ${b.burnedAmount.toString()} tons CO₂</p>
                        <p><strong>Expiry Date:</strong> ${expiryDate}</p>
                        <p><small>Verification Body: ${formatAddress(b.verificationBody)}</small></p>
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        showMessage('Failed to load batch list: ' + error.message, 'error');
    }
}

async function mintCarbonCredit() {
    if (!contract || !userAddress) {
        showMessage('Please connect wallet first', 'error');
        return;
    }
    const to = document.getElementById('mintTo').value;
    const batchId = document.getElementById('mintBatchId').value;
    const amount = document.getElementById('mintAmount').value;
    
    if (!to || !batchId || !amount) {
        showMessage('Please fill in all fields', 'error');
        return;
    }
    try {
        const owner = await contract.owner();
        const isOwner = userAddress.toLowerCase() === owner.toLowerCase();
        
        if (!isOwner) {
            showMessage('Only contract owner can mint tokens', 'error');
            return;
        }
        
        const batch = await contract.getCarbonCreditBatch(batchId);
        if (!batch.isVerified) {
            showMessage('Batch not verified, cannot mint tokens', 'error');
            return;
        }
        
        if (batch.expiryDate.toString() !== '0') {
            const expiryTime = batch.expiryDate.toNumber() * 1000;
            if (Date.now() > expiryTime) {
                showMessage('Batch expired, cannot mint tokens', 'error');
                return;
            }
        }
        
        const remaining = await contract.getBatchRemainingSupply(batchId);
        const mintAmount = ethers.BigNumber.from(ethers.utils.parseUnits(amount, 0));
        if (mintAmount.gt(remaining)) {
            showMessage(`Mint amount exceeds remaining supply (remaining: ${remaining.toString()} tons CO₂)`, 'error');
            return;
        }
    } catch (error) {
        if (error.message.includes('Batch not verified')) {
            showMessage('Batch not verified, cannot mint tokens', 'error');
        } else if (error.message.includes('Batch expired')) {
            showMessage('Batch expired, cannot mint tokens', 'error');
        } else {
            showMessage('Failed to check batch status: ' + error.message, 'error');
        }
        return;
    }
    try {
        showMessage('Minting tokens...', 'info');
        const tx = await contract.mintCarbonCredit(
            to,
            batchId,
            ethers.utils.parseUnits(amount, 0)
        );
        showMessage('Transaction submitted, waiting for confirmation', 'info');
        await tx.wait();
        showMessage('Tokens minted successfully', 'success');
        document.getElementById('mintTo').value = '';
        document.getElementById('mintBatchId').value = '';
        document.getElementById('mintAmount').value = '';
        loadDashboard();
    } catch (error) {
        let errorMsg = error.message;
        if (errorMsg.includes('OwnableUnauthorizedAccount') || errorMsg.includes('Not owner')) {
            errorMsg = 'Only contract owner can mint tokens';
        } else if (errorMsg.includes('Batch not verified')) {
            errorMsg = 'Batch not verified, cannot mint tokens';
        } else if (errorMsg.includes('Batch expired')) {
            errorMsg = 'Batch expired, cannot mint tokens';
        } else if (errorMsg.includes('Exceeds total reduction amount')) {
            errorMsg = 'Mint amount exceeds total emission reduction of batch';
        }
        showMessage('Failed to mint tokens: ' + errorMsg, 'error');
    }
}

async function retireAndBurn() {
    if (!contract) {
        showMessage('Please connect wallet first', 'error');
        return;
    }
    
    const batchId = document.getElementById('retireBatchId').value;
    const amount = document.getElementById('retireAmount').value;
    const esgReportRef = document.getElementById('esgReportRef').value || '';
    if (!batchId || !amount) {
        showMessage('Please enter batch ID and amount', 'error');
        return;
    }
    try {
        showMessage('Retiring and burning', 'info');
        const tx = await contract.retireAndBurnCarbonCredit(
            batchId,
            ethers.utils.parseUnits(amount, 0),
            esgReportRef
        );
        showMessage('Transaction submitted, waiting for confirmation...', 'info');
        await tx.wait();
        showMessage('Retired and burned successfully', 'success');
        document.getElementById('retireBatchId').value = '';
        document.getElementById('retireAmount').value = '';
        document.getElementById('esgReportRef').value = '';
        loadDashboard();
    } catch (error) {
        showMessage('Failed to retire and burn: ' + error.message, 'error');
    }
}

async function transferCarbonCredit() {
    if (!contract) {
        showMessage('Please connect wallet first', 'error');
        return;
    }
    
    const to = document.getElementById('transferTo').value;
    const batchId = document.getElementById('transferBatchId').value;
    const amount = document.getElementById('transferAmount').value;
    if (!to || !batchId || !amount) {
        showMessage('Please fill in all fields', 'error');
        return;
    }
    try {
        showMessage('Transferring', 'info');
        const tx = await contract.safeTransferFrom(
            userAddress,
            to,
            batchId,
            ethers.utils.parseUnits(amount, 0),
            '0x'
        );
        showMessage('Transaction submitted, waiting for confirmation', 'info');
        await tx.wait();
        showMessage('Transfer successful', 'success');
        document.getElementById('transferTo').value = '';
        document.getElementById('transferBatchId').value = '';
        document.getElementById('transferAmount').value = '';
        loadDashboard();
    } catch (error) {
        showMessage('Transfer failed: ' + error.message, 'error');
    }
}

async function authorizeVerificationBody() {
    if (!contract) {
        showMessage('Please connect wallet first', 'error');
        return;
    }
    const address = document.getElementById('authorizeAddress').value;
    if (!address) {
        showMessage('Please enter address', 'error');
        return;
    }
    try {
        showMessage('Authorizing...', 'info');
        const tx = await contract.authorizeVerificationBody(address);
        showMessage('Transaction submitted, waiting for confirmation', 'info');
        await tx.wait();
        showMessage('Authorization successful', 'success');
        document.getElementById('authorizeAddress').value = '';
        checkPermissions();
    } catch (error) {
        showMessage('Authorization failed: ' + error.message, 'error');
    }
}

async function pauseContract() {
    if (!contract) {
        showMessage('Please connect wallet first', 'error');
        return;
    }
    
    if (!confirm('Are you sure you want to pause the contract?')) return;
    
    try {
        showMessage('Pausing contract', 'info');
        const tx = await contract.pause();
        showMessage('Transaction submitted, waiting for confirmation', 'info');
        await tx.wait();
        showMessage('Contract paused', 'success');
        loadDashboard();
    } catch (error) {
        showMessage('Failed to pause contract: ' + error.message, 'error');
    }
}

async function unpauseContract() {
    if (!contract) {
        showMessage('Please connect wallet first', 'error');
        return;
    }
    try {
        showMessage('Unpausing contract', 'info');
        const tx = await contract.unpause();
        showMessage('Transaction submitted, waiting for confirmation', 'info');
        await tx.wait();
        showMessage('Contract unpaused', 'success');
        loadDashboard();
    } catch (error) {
        showMessage('Failed to unpause contract: ' + error.message, 'error');
    }
}

async function checkPermissions() {
    if (!contract || !userAddress) return;
    try {
        const owner = await contract.owner();
        const isAuthorized = await contract.authorizedVerificationBodies(userAddress);
        const isPaused = await contract.paused();
        const isOwner = userAddress.toLowerCase() === owner.toLowerCase();
        document.getElementById('permissionStatus').innerHTML = `
            <p><strong>Current Account:</strong> ${formatAddress(userAddress)}</p>
            <p><strong>Contract Owner:</strong> ${isOwner ? '✅ Yes' : '❌ No'}</p>
            <p><strong>Authorized Verification Body:</strong> ${isAuthorized ? '✅ Yes' : '❌ No'}</p>
            <p><strong>Contract Status:</strong> ${isPaused ? '⛔ Paused' : '✅ Running'}</p>
        `;
        
        const ownershipInfoEl = document.getElementById('ownershipInfo');
        if (ownershipInfoEl) {
            ownershipInfoEl.innerHTML = `
                <p><strong>Current Owner:</strong> ${formatAddress(owner)}</p>
                <p><strong>Your Account:</strong> ${formatAddress(userAddress)}</p>
                <p><strong>Is Owner:</strong> ${isOwner ? '✅ Yes' : '❌ No'}</p>
            `;
        }
    } catch (error) {
        showMessage('Failed to check permissions: ' + error.message, 'error');
    }
}

async function queryAddressBalance() {
    if (!contract) {
        showMessage('Please connect wallet first', 'error');
        return;
    }
    const address = document.getElementById('queryAddress').value.trim();
    const batchId = document.getElementById('queryBalanceBatchId').value;
    if (!address) {
        showMessage('Please enter address', 'error');
        return;
    }
    if (!batchId) {
        showMessage('Please enter batch ID', 'error');
        return;
    }
    if (!ethers.utils.isAddress(address)) {
        showMessage('Invalid address format', 'error');
        return;
    }
    
    try {
        const balance = await contract.balanceOf(address, batchId);
        const batch = await contract.getCarbonCreditBatch(batchId);
        
        document.getElementById('addressBalanceInfo').innerHTML = `
            <div class="batch-details">
                <h4>Balance Information</h4>
                <p><strong>Address:</strong> ${formatAddress(address)}</p>
                <p><strong>Batch ID:</strong> ${batchId}</p>
                <p><strong>Project Name:</strong> ${batch.projectName}</p>
                <p><strong>Balance:</strong> ${balance.toString()} tons CO₂</p>
                <p><strong>Status:</strong> ${balance.gt(0) ? '✅ Has balance' : '❌ No balance'}</p>
            </div>
        `;
    } catch (error) {
        showMessage('Failed to query balance: ' + error.message, 'error');
        document.getElementById('addressBalanceInfo').innerHTML = '<p>Query failed or batch does not exist</p>';
    }
}

async function transferOwnership() {
    if (!contract || !userAddress) {
        showMessage('Please connect wallet first', 'error');
        return;
    }
    
    const newOwner = document.getElementById('newOwnerAddress').value.trim();
    if (!newOwner) {
        showMessage('Please enter new owner address', 'error');
        return;
    }
    if (!ethers.utils.isAddress(newOwner)) {
        showMessage('Invalid address format', 'error');
        return;
    }
    
    try {
        const owner = await contract.owner();
        const isOwner = userAddress.toLowerCase() === owner.toLowerCase();
        
        if (!isOwner) {
            showMessage('Only contract owner can transfer ownership', 'error');
            return;
        }
        if (newOwner.toLowerCase() === owner.toLowerCase()) {
            showMessage('New owner address cannot be the same as current owner', 'error');
            return;
        }
        if (!confirm(`Are you sure you want to transfer ownership to ${formatAddress(newOwner)}?\n\nThis action cannot be undone!`)) {
            return;
        }
        showMessage('Transferring ownership', 'info');
        const tx = await contract.transferOwnership(newOwner);
        showMessage('Transaction submitted, waiting for confirmation...', 'info');
        await tx.wait();
        showMessage('Ownership transferred successfully', 'success');
        
        document.getElementById('newOwnerAddress').value = '';
        await checkPermissions();
        await loadDashboard();
    } catch (error) {
        let errorMsg = error.message;
        if (errorMsg.includes('OwnableUnauthorizedAccount') || errorMsg.includes('Not owner')) {
            errorMsg = 'Only contract owner can transfer ownership';
        }
        showMessage('Failed to transfer ownership: ' + errorMsg, 'error');
    }
}

async function renounceOwnership() {
    if (!contract || !userAddress) {
        showMessage('Please connect wallet first', 'error');
        return;
    }
    
    try {
        const owner = await contract.owner();
        const isOwner = userAddress.toLowerCase() === owner.toLowerCase();
        
        if (!isOwner) {
            showMessage('Only contract owner can renounce ownership', 'error');
            return;
        }
        if (!confirm('WARNING: Are you sure you want to renounce ownership?\n\nThis will permanently remove ownership from your account and the contract will have no owner. This action CANNOT be undone!\n\nClick OK to proceed.')) {
            return;
        }
        showMessage('Renouncing ownership...', 'info');
        const tx = await contract.renounceOwnership();
        showMessage('Transaction submitted, waiting for confirmation...', 'info');
        await tx.wait();
        showMessage('Ownership renounced successfully!', 'success');
        
        await checkPermissions();
        await loadDashboard();
    } catch (error) {
        let errorMsg = error.message;
        if (errorMsg.includes('OwnableUnauthorizedAccount') || errorMsg.includes('Not owner')) {
            errorMsg = 'Only contract owner can renounce ownership';
        }
        showMessage('Failed to renounce ownership: ' + errorMsg, 'error');
    }
}

if (typeof window !== 'undefined') {
    window.connectWallet = connectWallet;
    window.disconnectWallet = disconnectWallet;
    window.queryBatch = queryBatch;
    window.queryAddressBalance = queryAddressBalance;
    window.createBatch = createBatch;
    window.verifyBatch = verifyBatch;
    window.loadAllBatches = loadAllBatches;
    window.mintCarbonCredit = mintCarbonCredit;
    window.retireAndBurn = retireAndBurn;
    window.transferCarbonCredit = transferCarbonCredit;
    window.authorizeVerificationBody = authorizeVerificationBody;
    window.transferOwnership = transferOwnership;
    window.renounceOwnership = renounceOwnership;
    window.pauseContract = pauseContract;
    window.unpauseContract = unpauseContract;
    window.showMessage = showMessage;
    window.quickAuthorizeSelf = quickAuthorizeSelf;
    console.log('All functions exposed to global scope');
}

function initializeApp() {
    console.log('Starting app initialization...');
    initTabs();
    const connectBtn = document.getElementById('connectBtn');
    if (connectBtn) {
        const newBtn = connectBtn.cloneNode(true);
        connectBtn.parentNode.replaceChild(newBtn, connectBtn);
        newBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Button clicked, preparing to connect wallet...');
            connectWallet();
        });
        newBtn.onclick = function(e) {
            e.preventDefault();
            console.log('onclick event triggered');
            connectWallet();
        };
        
        console.log('Connect button event listener added');
    } else {
        console.error('Connect button element not found');
    }
    
    setTimeout(async () => {
        console.log('=== MetaMask Detection Diagnostics ===');
        console.log('window.ethereum:', typeof window.ethereum, window.ethereum);
        console.log('window.web3:', typeof window.web3, window.web3);
        console.log('navigator.userAgent:', navigator.userAgent);
        let ethereum = null;
        if (typeof window.ethereum !== 'undefined') {
            ethereum = window.ethereum;
            console.log('Wallet detected via window.ethereum');
        }
        else if (typeof window.web3 !== 'undefined' && window.web3.currentProvider) {
            ethereum = window.web3.currentProvider;
            console.log('Wallet detected via window.web3');
        }
        else if (typeof chrome !== 'undefined' && chrome.runtime) {
            try {
                const metamaskId = 'nkbihfbeogaeaoehlefnkodbefgpgknn';
                chrome.runtime.sendMessage(metamaskId, { method: 'eth_accounts' }, (response) => {
                    if (!chrome.runtime.lastError) {
                        console.log('MetaMask detected via chrome.runtime');
                    }
                });
            } catch (e) {
                console.log('chrome.runtime detection failed:', e);
            }
        }
        else {
            console.warn('First detection: MetaMask not detected, retrying after 2 seconds');
            setTimeout(() => {
                console.log('window.ethereum:', typeof window.ethereum, window.ethereum);
                
                if (typeof window.ethereum !== 'undefined') {
                    console.log('Retry successful: MetaMask detected');
                    ethereum = window.ethereum;
                    window.ethereum = ethereum;
                    checkAndAutoConnect();
                } else {
                    console.error('MetaMask still not detected after retry');
                    showMetaMaskInstallGuide();
                }
            }, 2000);
            return;
        }
        
        if (!ethereum) {
            showMetaMaskInstallGuide();
            return;
        }
        if (typeof window.ethereum === 'undefined') {
            window.ethereum = ethereum;
        }
        
        console.log('MetaMask detected, provider:', ethereum);
        checkAndAutoConnect();
    }, 500);
    
    async function checkAndAutoConnect() {
        if (typeof ethers === 'undefined') {
            console.error('ethers.js not loaded');
            showMessage('ethers.js not loaded, please refresh page', 'error');
            return;
        }
        
        console.log('ethers.js loaded');
        try {
            if (typeof window.ethereum === 'undefined') {
                console.log('Waiting for MetaMask injection...');
                return;
            }
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                console.log('Detected connected account, auto-connecting...');
                await connectWallet();
            } else {
                console.log('No connected account detected');
            }
        } catch (error) {
            console.error('Failed to check connected account:', error);
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

window.addEventListener('load', function() {
    console.log('window load event triggered');
    const btn = document.getElementById('connectBtn');
    if (btn && !btn.onclick) {
        console.log('Re-binding connect button event');
        btn.addEventListener('click', connectWallet);
        btn.onclick = connectWallet;
    }
});

