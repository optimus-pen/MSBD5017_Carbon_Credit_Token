// 合约配置
const CONTRACT_ADDRESS = '0xBd214514bdDf69395f6cB69A26557c8C5F0612F5';
let contract = null;
let signer = null;
let userAddress = null;

// 加载 ABI
async function loadABI() {
    try {
        const response = await fetch('abi_carbon.json');
        return await response.json();
    } catch (error) {
        showMessage('加载 ABI 失败: ' + error.message, 'error');
        return null;
    }
}

// 连接 MetaMask
async function connectWallet() {
    console.log('=== 连接钱包函数被调用 ===');
    console.log('window.ethereum:', typeof window.ethereum);
    console.log('ethers:', typeof ethers);
    
    // 检查 MetaMask 是否安装 - 使用多种方式检测
    let ethereum = null;
    
    if (typeof window.ethereum !== 'undefined') {
        ethereum = window.ethereum;
        console.log('检测到 window.ethereum');
    } else if (typeof window.web3 !== 'undefined' && window.web3.currentProvider) {
        ethereum = window.web3.currentProvider;
        console.log('检测到 window.web3.currentProvider');
    } else {
        // 最后尝试：等待一下，MetaMask 可能延迟注入
        console.warn('未检测到钱包，等待 1 秒后重试...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        if (typeof window.ethereum !== 'undefined') {
            ethereum = window.ethereum;
            console.log('重试后检测到 window.ethereum');
        } else {
            showMetaMaskInstallGuide();
            return;
        }
    }
    
    // 确保 window.ethereum 已设置
    if (typeof window.ethereum === 'undefined' && ethereum) {
        window.ethereum = ethereum;
    }
    
    if (!ethereum) {
        showMetaMaskInstallGuide();
        return;
    }
    
    // 检查 ethers 是否加载
    if (typeof ethers === 'undefined') {
        const errorMsg = 'ethers.js 未加载，请刷新页面重试。如果问题持续，请检查网络连接。';
        console.error('ethers.js 未定义，请检查 CDN 是否加载成功');
        showMessage(errorMsg, 'error');
        alert('ethers.js 库未加载成功，请刷新页面重试');
        return;
    }
    
    try {
        console.log('开始连接 MetaMask...');
        showMessage('正在连接 MetaMask...', 'info');
        
        // 请求账户访问
        console.log('请求账户访问...');
        const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
        console.log('获取到的账户:', accounts);
        
        if (accounts.length === 0) {
            showMessage('未获取到账户，请确认 MetaMask 已解锁', 'error');
            return;
        }
        
        userAddress = accounts[0];
        console.log('已连接账户:', userAddress);
        
        // 创建 provider 和 signer
        const provider = new ethers.providers.Web3Provider(ethereum);
        signer = provider.getSigner();
        
        // 加载 ABI
        showMessage('正在加载合约 ABI...', 'info');
        const abi = await loadABI();
        
        if (!abi) {
            showMessage('加载 ABI 失败', 'error');
            return;
        }
        
        // 创建合约实例
        contract = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
        console.log('合约实例已创建');
        
        // 更新 UI
        updateWalletUI();
        showMessage('连接成功！', 'success');
        
        // 加载数据
        await loadDashboard();
        await checkPermissions();
        await updateBatchPagePermissions();
        
        // 监听账户变化
        ethereum.on('accountsChanged', (accounts) => {
            if (accounts.length === 0) {
                disconnectWallet();
            } else {
                connectWallet();
            }
        });
        
        // 监听网络变化
        ethereum.on('chainChanged', () => {
            window.location.reload();
        });
        
    } catch (error) {
        console.error('连接钱包错误:', error);
        if (error.code === 4001) {
            showMessage('用户拒绝了连接请求', 'error');
        } else {
            showMessage('连接钱包失败: ' + error.message, 'error');
        }
    }
}

// 断开钱包
function disconnectWallet() {
    userAddress = null;
    signer = null;
    contract = null;
    const connectBtn = document.getElementById('connectBtn');
    const walletAddress = document.getElementById('walletAddress');
    if (connectBtn) connectBtn.style.display = 'block';
    if (walletAddress) walletAddress.style.display = 'none';
    
    // 清空显示内容
    const myBalances = document.getElementById('myBalances');
    const contractStatus = document.getElementById('contractStatus');
    if (myBalances) myBalances.innerHTML = '<p>请先连接钱包...</p>';
    if (contractStatus) contractStatus.innerHTML = '<p>请先连接钱包...</p>';
    
    showMessage('已断开连接', 'info');
}

// 更新钱包 UI
function updateWalletUI() {
    const connectBtn = document.getElementById('connectBtn');
    const walletAddress = document.getElementById('walletAddress');
    const walletAddressText = document.getElementById('walletAddressText');
    
    if (connectBtn) connectBtn.style.display = 'none';
    if (walletAddress) walletAddress.style.display = 'flex';
    if (walletAddressText) walletAddressText.textContent = `已连接: ${formatAddress(userAddress)}`;
}

// 格式化地址
function formatAddress(address) {
    return address ? `${address.substring(0, 6)}...${address.substring(address.length - 4)}` : '';
}

// 显示消息
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

// 显示诊断信息
function showDiagnosticInfo() {
    console.log('\n=== 详细诊断信息 ===');
    console.log('1. 浏览器信息:');
    console.log('   User Agent:', navigator.userAgent);
    console.log('   浏览器类型:', detectBrowser());
    
    console.log('\n2. 扩展检测:');
    console.log('   window.ethereum:', typeof window.ethereum);
    console.log('   window.web3:', typeof window.web3);
    console.log('   chrome.runtime:', typeof chrome !== 'undefined' ? typeof chrome.runtime : 'N/A');
    
    console.log('\n3. 建议操作:');
    console.log('   a) 打开 Chrome 扩展管理页面: chrome://extensions/');
    console.log('   b) 找到 MetaMask 扩展');
    console.log('   c) 确保扩展已启用（开关打开）');
    console.log('   d) 点击 MetaMask 图标，确保钱包已解锁');
    console.log('   e) 刷新此页面（F5）');
    console.log('   f) 如果仍然不行，尝试重启浏览器');
    
    console.log('\n4. 手动测试:');
    console.log('   在控制台输入以下命令测试:');
    console.log('   window.ethereum');
    console.log('   如果返回 undefined，说明 MetaMask 未正确注入');
}

// 检测浏览器类型
function detectBrowser() {
    const ua = navigator.userAgent;
    if (ua.indexOf('Chrome') > -1 && ua.indexOf('Edg') === -1) return 'Chrome';
    if (ua.indexOf('Edg') > -1) return 'Edge';
    if (ua.indexOf('Firefox') > -1) return 'Firefox';
    if (ua.indexOf('Safari') > -1) return 'Safari';
    return 'Unknown';
}

// 显示 MetaMask 安装指南
function showMetaMaskInstallGuide() {
    const message = `
无法检测到 MetaMask！

请按以下步骤操作：
1. 如果未安装 MetaMask：
   - Chrome/Edge: https://chrome.google.com/webstore/detail/metamask
   - Firefox: https://addons.mozilla.org/firefox/addon/ether-metamask
   - 安装后创建或导入钱包

2. 如果已安装 MetaMask：
   - 打开扩展管理页面: chrome://extensions/
   - 确保 MetaMask 扩展已启用（开关打开）
   - 点击浏览器工具栏的 MetaMask 图标
   - 解锁您的钱包
   - 刷新此页面（按 F5）

3. 如果问题仍然存在：
   - 尝试重启浏览器
   - 检查浏览器是否阻止了扩展
   - 查看控制台的详细诊断信息
    `;
    
    showMessage('无法检测到 MetaMask，请查看控制台获取详细说明', 'error');
    console.error(message);
    
    // 更新按钮文本，但保持可点击（让用户尝试手动连接）
    const btn = document.getElementById('connectBtn');
    if (btn) {
        btn.textContent = 'MetaMask 未检测到 - 点击重试';
        btn.onclick = function() {
            console.log('手动重试连接...');
            // 强制重新检测
            if (typeof window.ethereum !== 'undefined') {
                console.log('✅ 现在检测到 MetaMask 了！');
                connectWallet();
            } else {
                showMessage('仍未检测到 MetaMask，请检查扩展是否启用', 'error');
                showDiagnosticInfo();
            }
        };
    }
}

// 初始化标签页切换
function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            
            // 更新按钮状态
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // 更新内容显示
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            const tabContent = document.getElementById(tab);
            if (tabContent) {
                tabContent.classList.add('active');
            }
            
            // 加载对应标签页的数据（需要合约已连接）
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

// 更新批次管理页面的权限状态
async function updateBatchPagePermissions() {
    if (!contract || !userAddress) return;
    
    try {
        const owner = await contract.owner();
        const isOwner = userAddress.toLowerCase() === owner.toLowerCase();
        const isAuthorized = await contract.authorizedVerificationBodies(userAddress);
        
        // 在创建批次卡片中显示权限状态
        const createBatchCard = document.querySelector('#batches .card:first-child');
        if (createBatchCard) {
            let permissionHtml = '<p><small>';
            if (isAuthorized) {
                permissionHtml += '<span style="color: #28a745;">✅ 您已授权为核证机构，可以创建批次</span>';
            } else if (isOwner) {
                permissionHtml += '<span style="color: #ffc107;">⚠️ 您需要先授权自己为核证机构</span>';
                permissionHtml += '<br><button onclick="quickAuthorizeSelf()" class="btn btn-warning" style="margin-top: 10px; font-size: 12px; padding: 6px 12px;">快速授权自己</button>';
            } else {
                permissionHtml += '<span style="color: #dc3545;">❌ 您不是授权的核证机构</span>';
                permissionHtml += '<br><small>请联系合约所有者授权您的账户</small>';
            }
            permissionHtml += '</small></p>';
            
            // 更新权限提示
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
        console.error('更新权限状态失败:', error);
    }
}

// 快速授权自己（仅合约所有者）
async function quickAuthorizeSelf() {
    if (!contract || !userAddress) {
        showMessage('请先连接钱包', 'error');
        return;
    }
    
    try {
        const owner = await contract.owner();
        const isOwner = userAddress.toLowerCase() === owner.toLowerCase();
        
        if (!isOwner) {
            showMessage('只有合约所有者可以授权核证机构', 'error');
            return;
        }
        
        const isAuthorized = await contract.authorizedVerificationBodies(userAddress);
        if (isAuthorized) {
            showMessage('您已经是授权的核证机构', 'info');
            updateBatchPagePermissions();
            return;
        }
        
        if (!confirm('确定要授权当前账户为核证机构吗？')) return;
        
        showMessage('正在授权...', 'info');
        const tx = await contract.authorizeVerificationBody(userAddress);
        showMessage('交易已提交，等待确认...', 'info');
        await tx.wait();
        showMessage('授权成功！您现在可以创建批次了', 'success');
        
        // 更新权限状态
        updateBatchPagePermissions();
        checkPermissions();
    } catch (error) {
        showMessage('授权失败: ' + error.message, 'error');
    }
}

// 加载仪表盘
async function loadDashboard() {
    if (!contract || !userAddress) return;
    
    try {
        // 加载余额
        await loadMyBalances();
        
        // 加载合约状态
        const isPaused = await contract.paused();
        const owner = await contract.owner();
        const nextBatchId = await contract.nextBatchId();
        
        document.getElementById('contractStatus').innerHTML = `
            <p><strong>合约状态:</strong> ${isPaused ? '⛔ 已暂停' : '✅ 正常运行'}</p>
            <p><strong>合约所有者:</strong> ${formatAddress(owner)}</p>
            <p><strong>下一个批次ID:</strong> ${nextBatchId.toString()}</p>
            <p><strong>合约地址:</strong> ${formatAddress(CONTRACT_ADDRESS)}</p>
        `;
    } catch (error) {
        showMessage('加载仪表盘失败: ' + error.message, 'error');
    }
}

// 加载我的余额
async function loadMyBalances() {
    if (!contract || !userAddress) return;
    
    try {
        const nextBatchId = await contract.nextBatchId();
        const balances = [];
        
        // 查询所有批次的余额
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
                // 批次不存在，跳过
            }
        }
        
        const balancesEl = document.getElementById('myBalances');
        if (balances.length === 0) {
            balancesEl.innerHTML = '<p>暂无余额</p>';
        } else {
            balancesEl.innerHTML = balances.map(b => `
                <div class="balance-item">
                    <strong>批次 ${b.batchId}:</strong> ${b.balance} 吨CO₂
                    <br><small>${b.projectName}</small>
                </div>
            `).join('');
        }
    } catch (error) {
        showMessage('加载余额失败: ' + error.message, 'error');
    }
}

// 查询批次信息
async function queryBatch() {
    if (!contract) {
        showMessage('请先连接钱包', 'error');
        return;
    }
    
    const batchId = document.getElementById('queryBatchId').value;
    if (!batchId) {
        showMessage('请输入批次ID', 'error');
        return;
    }
    
    try {
        const batch = await contract.getCarbonCreditBatch(batchId);
        const remaining = await contract.getBatchRemainingSupply(batchId);
        const totalMinted = await contract.totalMintedPerBatch(batchId);
        const isAuthorized = await contract.authorizedVerificationBodies(userAddress);
        
        const expiryDate = batch.expiryDate.toString() === '0' 
            ? '永久有效' 
            : new Date(batch.expiryDate.toNumber() * 1000).toLocaleString();
        
        document.getElementById('batchInfo').innerHTML = `
            <div class="batch-details">
                <h4>批次 #${batch.batchId}</h4>
                <p><strong>项目名称:</strong> ${batch.projectName}</p>
                <p><strong>核证机构:</strong> ${formatAddress(batch.verificationBody)}</p>
                <p><strong>总减排量:</strong> ${batch.totalEmissionReduction.toString()} 吨CO₂</p>
                <p><strong>已铸造:</strong> ${totalMinted.toString()} 吨CO₂</p>
                <p><strong>剩余可铸造:</strong> ${remaining.toString()} 吨CO₂</p>
                <p><strong>已注销:</strong> ${batch.burnedAmount.toString()} 吨CO₂</p>
                <p><strong>发行日期:</strong> ${new Date(batch.issuedDate.toNumber() * 1000).toLocaleString()}</p>
                <p><strong>有效期:</strong> ${expiryDate}</p>
                <p><strong>核证状态:</strong> ${batch.isVerified ? '✅ 已核证' : '❌ 未核证'}</p>
                <p><strong>IPFS哈希:</strong> ${batch.verificationDocHash}</p>
            </div>
        `;
    } catch (error) {
        showMessage('查询批次失败: ' + error.message, 'error');
        document.getElementById('batchInfo').innerHTML = '<p>批次不存在或查询失败</p>';
    }
}

// 创建批次
async function createBatch() {
    if (!contract || !userAddress) {
        showMessage('请先连接钱包', 'error');
        return;
    }
    
    const projectName = document.getElementById('projectName').value;
    const totalEmissionReduction = document.getElementById('totalEmissionReduction').value;
    const expiryDate = document.getElementById('expiryDate').value || '0';
    const verificationDocHash = document.getElementById('verificationDocHash').value;
    
    if (!projectName || !totalEmissionReduction || !verificationDocHash) {
        showMessage('请填写所有必填字段', 'error');
        return;
    }
    
    // 检查权限
    try {
        const isAuthorized = await contract.authorizedVerificationBodies(userAddress);
        if (!isAuthorized) {
            const owner = await contract.owner();
            const isOwner = userAddress.toLowerCase() === owner.toLowerCase();
            
            let errorMsg = '❌ 当前账户不是授权的核证机构！\n\n';
            if (isOwner) {
                errorMsg += '💡 解决方案：\n';
                errorMsg += '1. 切换到"管理员"标签页\n';
                errorMsg += '2. 在"授权核证机构"中输入您的地址：' + userAddress + '\n';
                errorMsg += '3. 点击"授权"按钮\n';
                errorMsg += '4. 授权成功后，返回此页面创建批次';
            } else {
                errorMsg += '💡 解决方案：\n';
                errorMsg += '请联系合约所有者（' + formatAddress(owner) + '）授权您的账户为核证机构。\n';
                errorMsg += '或者切换到"管理员"标签页查看权限状态。';
            }
            
            alert(errorMsg);
            showMessage('权限不足：需要授权核证机构权限', 'error');
            return;
        }
    } catch (error) {
        showMessage('检查权限失败: ' + error.message, 'error');
        return;
    }
    
    try {
        showMessage('正在创建批次...', 'info');
        const tx = await contract.createCarbonCreditBatch(
            projectName,
            ethers.utils.parseUnits(totalEmissionReduction, 0),
            expiryDate,
            verificationDocHash
        );
        showMessage('交易已提交，等待确认...', 'info');
        await tx.wait();
        showMessage('批次创建成功！', 'success');
        
        // 清空表单
        document.getElementById('projectName').value = '';
        document.getElementById('totalEmissionReduction').value = '';
        document.getElementById('expiryDate').value = '';
        document.getElementById('verificationDocHash').value = '';
        
        // 刷新批次列表
        loadAllBatches();
    } catch (error) {
        // 改进错误处理
        let errorMsg = error.message;
        if (errorMsg.includes('Not authorized verification body') || errorMsg.includes('Not authorized')) {
            errorMsg = '权限不足：当前账户不是授权的核证机构。请先在"管理员"标签页授权您的账户。';
        }
        showMessage('创建批次失败: ' + errorMsg, 'error');
    }
}

// 核证批次
async function verifyBatch() {
    if (!contract || !userAddress) {
        showMessage('请先连接钱包', 'error');
        return;
    }
    
    const batchId = document.getElementById('verifyBatchId').value;
    if (!batchId) {
        showMessage('请输入批次ID', 'error');
        return;
    }
    
    try {
        // 检查批次是否存在以及是否为创建者
        const batch = await contract.getCarbonCreditBatch(batchId);
        if (batch.verificationBody.toLowerCase() !== userAddress.toLowerCase()) {
            showMessage('❌ 只有批次创建者可以核证该批次', 'error');
            return;
        }
        
        if (batch.isVerified) {
            showMessage('该批次已经核证过了', 'info');
            return;
        }
        
        showMessage('正在核证批次...', 'info');
        const tx = await contract.verifyCarbonCreditBatch(batchId);
        showMessage('交易已提交，等待确认...', 'info');
        await tx.wait();
        showMessage('批次核证成功！', 'success');
        document.getElementById('verifyBatchId').value = '';
        loadAllBatches();
    } catch (error) {
        let errorMsg = error.message;
        if (errorMsg.includes('Only batch creator can verify') || errorMsg.includes('Not authorized')) {
            errorMsg = '只有批次创建者可以核证该批次';
        }
        showMessage('核证批次失败: ' + errorMsg, 'error');
    }
}

// 加载所有批次
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
                // 跳过不存在的批次
            }
        }
        
        const batchesEl = document.getElementById('allBatches');
        if (batches.length === 0) {
            batchesEl.innerHTML = '<p>暂无批次</p>';
        } else {
            batchesEl.innerHTML = batches.map(b => {
                const expiryDate = b.expiryDate.toString() === '0' 
                    ? '永久有效' 
                    : new Date(b.expiryDate.toNumber() * 1000).toLocaleString();
                
                return `
                    <div class="batch-card">
                        <h4>批次 #${b.batchId}: ${b.projectName}</h4>
                        <p><strong>状态:</strong> ${b.isVerified ? '✅ 已核证' : '❌ 未核证'}</p>
                        <p><strong>总减排量:</strong> ${b.totalEmissionReduction.toString()} 吨CO₂</p>
                        <p><strong>已铸造:</strong> ${b.totalMinted} 吨CO₂</p>
                        <p><strong>剩余:</strong> ${b.remaining} 吨CO₂</p>
                        <p><strong>已注销:</strong> ${b.burnedAmount.toString()} 吨CO₂</p>
                        <p><strong>有效期:</strong> ${expiryDate}</p>
                        <p><small>核证机构: ${formatAddress(b.verificationBody)}</small></p>
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        showMessage('加载批次列表失败: ' + error.message, 'error');
    }
}

// 铸造代币
async function mintCarbonCredit() {
    if (!contract || !userAddress) {
        showMessage('请先连接钱包', 'error');
        return;
    }
    
    const to = document.getElementById('mintTo').value;
    const batchId = document.getElementById('mintBatchId').value;
    const amount = document.getElementById('mintAmount').value;
    
    if (!to || !batchId || !amount) {
        showMessage('请填写所有字段', 'error');
        return;
    }
    
    // 检查权限
    try {
        const owner = await contract.owner();
        const isOwner = userAddress.toLowerCase() === owner.toLowerCase();
        
        if (!isOwner) {
            showMessage('❌ 只有合约所有者可以铸造代币', 'error');
            return;
        }
        
        // 检查批次状态
        const batch = await contract.getCarbonCreditBatch(batchId);
        if (!batch.isVerified) {
            showMessage('❌ 批次未核证，无法铸造代币', 'error');
            return;
        }
        
        // 检查是否过期
        if (batch.expiryDate.toString() !== '0') {
            const expiryTime = batch.expiryDate.toNumber() * 1000;
            if (Date.now() > expiryTime) {
                showMessage('❌ 批次已过期，无法铸造代币', 'error');
                return;
            }
        }
        
        // 检查剩余可铸造量
        const remaining = await contract.getBatchRemainingSupply(batchId);
        const mintAmount = ethers.BigNumber.from(ethers.utils.parseUnits(amount, 0));
        if (mintAmount.gt(remaining)) {
            showMessage(`❌ 铸造数量超过剩余可铸造量（剩余：${remaining.toString()} 吨CO₂）`, 'error');
            return;
        }
    } catch (error) {
        if (error.message.includes('Batch not verified')) {
            showMessage('❌ 批次未核证，无法铸造代币', 'error');
        } else if (error.message.includes('Batch expired')) {
            showMessage('❌ 批次已过期，无法铸造代币', 'error');
        } else {
            showMessage('检查批次状态失败: ' + error.message, 'error');
        }
        return;
    }
    
    try {
        showMessage('正在铸造代币...', 'info');
        const tx = await contract.mintCarbonCredit(
            to,
            batchId,
            ethers.utils.parseUnits(amount, 0)
        );
        showMessage('交易已提交，等待确认...', 'info');
        await tx.wait();
        showMessage('代币铸造成功！', 'success');
        
        document.getElementById('mintTo').value = '';
        document.getElementById('mintBatchId').value = '';
        document.getElementById('mintAmount').value = '';
        
        loadDashboard();
    } catch (error) {
        let errorMsg = error.message;
        if (errorMsg.includes('OwnableUnauthorizedAccount') || errorMsg.includes('Not owner')) {
            errorMsg = '只有合约所有者可以铸造代币';
        } else if (errorMsg.includes('Batch not verified')) {
            errorMsg = '批次未核证，无法铸造代币';
        } else if (errorMsg.includes('Batch expired')) {
            errorMsg = '批次已过期，无法铸造代币';
        } else if (errorMsg.includes('Exceeds total reduction amount')) {
            errorMsg = '铸造数量超过批次总减排量';
        }
        showMessage('铸造代币失败: ' + errorMsg, 'error');
    }
}

// 注销销毁
async function retireAndBurn() {
    if (!contract) {
        showMessage('请先连接钱包', 'error');
        return;
    }
    
    const batchId = document.getElementById('retireBatchId').value;
    const amount = document.getElementById('retireAmount').value;
    const esgReportRef = document.getElementById('esgReportRef').value || '';
    
    if (!batchId || !amount) {
        showMessage('请填写批次ID和数量', 'error');
        return;
    }
    
    try {
        showMessage('正在注销销毁...', 'info');
        const tx = await contract.retireAndBurnCarbonCredit(
            batchId,
            ethers.utils.parseUnits(amount, 0),
            esgReportRef
        );
        showMessage('交易已提交，等待确认...', 'info');
        await tx.wait();
        showMessage('注销销毁成功！', 'success');
        
        document.getElementById('retireBatchId').value = '';
        document.getElementById('retireAmount').value = '';
        document.getElementById('esgReportRef').value = '';
        
        loadDashboard();
    } catch (error) {
        showMessage('注销销毁失败: ' + error.message, 'error');
    }
}

// 转账
async function transferCarbonCredit() {
    if (!contract) {
        showMessage('请先连接钱包', 'error');
        return;
    }
    
    const to = document.getElementById('transferTo').value;
    const batchId = document.getElementById('transferBatchId').value;
    const amount = document.getElementById('transferAmount').value;
    
    if (!to || !batchId || !amount) {
        showMessage('请填写所有字段', 'error');
        return;
    }
    
    try {
        showMessage('正在转账...', 'info');
        const tx = await contract.safeTransferFrom(
            userAddress,
            to,
            batchId,
            ethers.utils.parseUnits(amount, 0),
            '0x'
        );
        showMessage('交易已提交，等待确认...', 'info');
        await tx.wait();
        showMessage('转账成功！', 'success');
        
        document.getElementById('transferTo').value = '';
        document.getElementById('transferBatchId').value = '';
        document.getElementById('transferAmount').value = '';
        
        loadDashboard();
    } catch (error) {
        showMessage('转账失败: ' + error.message, 'error');
    }
}

// 授权核证机构
async function authorizeVerificationBody() {
    if (!contract) {
        showMessage('请先连接钱包', 'error');
        return;
    }
    
    const address = document.getElementById('authorizeAddress').value;
    if (!address) {
        showMessage('请输入地址', 'error');
        return;
    }
    
    try {
        showMessage('正在授权...', 'info');
        const tx = await contract.authorizeVerificationBody(address);
        showMessage('交易已提交，等待确认...', 'info');
        await tx.wait();
        showMessage('授权成功！', 'success');
        document.getElementById('authorizeAddress').value = '';
        checkPermissions();
    } catch (error) {
        showMessage('授权失败: ' + error.message, 'error');
    }
}

// 暂停合约
async function pauseContract() {
    if (!contract) {
        showMessage('请先连接钱包', 'error');
        return;
    }
    
    if (!confirm('确定要暂停合约吗？')) return;
    
    try {
        showMessage('正在暂停合约...', 'info');
        const tx = await contract.pause();
        showMessage('交易已提交，等待确认...', 'info');
        await tx.wait();
        showMessage('合约已暂停', 'success');
        loadDashboard();
    } catch (error) {
        showMessage('暂停合约失败: ' + error.message, 'error');
    }
}

// 恢复合约
async function unpauseContract() {
    if (!contract) {
        showMessage('请先连接钱包', 'error');
        return;
    }
    
    try {
        showMessage('正在恢复合约...', 'info');
        const tx = await contract.unpause();
        showMessage('交易已提交，等待确认...', 'info');
        await tx.wait();
        showMessage('合约已恢复', 'success');
        loadDashboard();
    } catch (error) {
        showMessage('恢复合约失败: ' + error.message, 'error');
    }
}

// 检查权限
async function checkPermissions() {
    if (!contract || !userAddress) return;
    
    try {
        const owner = await contract.owner();
        const isAuthorized = await contract.authorizedVerificationBodies(userAddress);
        const isPaused = await contract.paused();
        
        const isOwner = userAddress.toLowerCase() === owner.toLowerCase();
        
        document.getElementById('permissionStatus').innerHTML = `
            <p><strong>当前账户:</strong> ${formatAddress(userAddress)}</p>
            <p><strong>合约所有者:</strong> ${isOwner ? '✅ 是' : '❌ 否'}</p>
            <p><strong>授权核证机构:</strong> ${isAuthorized ? '✅ 是' : '❌ 否'}</p>
            <p><strong>合约状态:</strong> ${isPaused ? '⛔ 已暂停' : '✅ 正常运行'}</p>
        `;
    } catch (error) {
        showMessage('检查权限失败: ' + error.message, 'error');
    }
}

// 确保所有函数都在全局作用域
if (typeof window !== 'undefined') {
    window.connectWallet = connectWallet;
    window.disconnectWallet = disconnectWallet;
    window.queryBatch = queryBatch;
    window.createBatch = createBatch;
    window.verifyBatch = verifyBatch;
    window.loadAllBatches = loadAllBatches;
    window.mintCarbonCredit = mintCarbonCredit;
    window.retireAndBurn = retireAndBurn;
    window.transferCarbonCredit = transferCarbonCredit;
    window.authorizeVerificationBody = authorizeVerificationBody;
    window.pauseContract = pauseContract;
    window.unpauseContract = unpauseContract;
    window.showMessage = showMessage;
    window.quickAuthorizeSelf = quickAuthorizeSelf;
    console.log('所有函数已暴露到全局作用域');
}

// 页面加载时初始化
function initializeApp() {
    console.log('开始初始化应用...');
    
    // 初始化标签页切换
    initTabs();
    
    // 为连接按钮添加事件监听器（使用多种方式确保绑定成功）
    const connectBtn = document.getElementById('connectBtn');
    if (connectBtn) {
        // 移除可能存在的旧监听器
        const newBtn = connectBtn.cloneNode(true);
        connectBtn.parentNode.replaceChild(newBtn, connectBtn);
        
        // 添加新的事件监听器
        newBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('按钮被点击，准备连接钱包...');
            connectWallet();
        });
        
        // 也添加到全局作用域作为备用
        newBtn.onclick = function(e) {
            e.preventDefault();
            console.log('onclick 事件触发');
            connectWallet();
        };
        
        console.log('连接按钮事件监听器已添加');
    } else {
        console.error('未找到连接按钮元素');
    }
    
    // 等待一下确保所有脚本都加载完成
    setTimeout(async () => {
        // 详细的诊断信息
        console.log('=== MetaMask 检测诊断 ===');
        console.log('window.ethereum:', typeof window.ethereum, window.ethereum);
        console.log('window.web3:', typeof window.web3, window.web3);
        console.log('navigator.userAgent:', navigator.userAgent);
        
        // 检查 MetaMask - 使用多种方式检测
        let ethereum = null;
        
        // 方式1: 检查 window.ethereum
        if (typeof window.ethereum !== 'undefined') {
            ethereum = window.ethereum;
            console.log('✅ 通过 window.ethereum 检测到钱包');
        }
        // 方式2: 检查 window.web3
        else if (typeof window.web3 !== 'undefined' && window.web3.currentProvider) {
            ethereum = window.web3.currentProvider;
            console.log('✅ 通过 window.web3 检测到钱包');
        }
        // 方式3: 尝试从 chrome 扩展直接访问（仅限 Chrome）
        else if (typeof chrome !== 'undefined' && chrome.runtime) {
            try {
                // 尝试检测 MetaMask 扩展 ID
                const metamaskId = 'nkbihfbeogaeaoehlefnkodbefgpgknn'; // MetaMask 的扩展 ID
                chrome.runtime.sendMessage(metamaskId, { method: 'eth_accounts' }, (response) => {
                    if (!chrome.runtime.lastError) {
                        console.log('✅ 通过 chrome.runtime 检测到 MetaMask');
                    }
                });
            } catch (e) {
                console.log('chrome.runtime 检测失败:', e);
            }
        }
        // 方式4: 等待一段时间后重试（MetaMask 可能延迟注入）
        else {
            console.warn('⚠️ 首次检测：MetaMask 未检测到，等待 2 秒后重试...');
            setTimeout(() => {
                console.log('=== 重试检测 ===');
                console.log('window.ethereum:', typeof window.ethereum, window.ethereum);
                
                if (typeof window.ethereum !== 'undefined') {
                    console.log('✅ 重试成功：MetaMask 已检测到');
                    ethereum = window.ethereum;
                    window.ethereum = ethereum; // 确保设置到全局
                    // 继续后续流程
                    checkAndAutoConnect();
                } else {
                    console.error('❌ 重试后仍未检测到 MetaMask');
                    showMetaMaskInstallGuide();
                    showDiagnosticInfo();
                }
            }, 2000);
            return; // 等待重试，先不继续
        }
        
        if (!ethereum) {
            showMetaMaskInstallGuide();
            showDiagnosticInfo();
            return;
        }
        
        // 确保 window.ethereum 已设置
        if (typeof window.ethereum === 'undefined') {
            window.ethereum = ethereum;
        }
        
        console.log('✅ MetaMask 已检测到，提供者:', ethereum);
        
        // 继续检查是否已连接
        checkAndAutoConnect();
    }, 500);
    
    // 检查并自动连接的函数
    async function checkAndAutoConnect() {
        
        // 检查 ethers
        if (typeof ethers === 'undefined') {
            console.error('ethers.js 未加载');
            showMessage('ethers.js 未加载，请刷新页面', 'error');
            return;
        }
        
        console.log('ethers.js 已加载');
        
        // 检查是否已连接
        try {
            if (typeof window.ethereum === 'undefined') {
                console.log('等待 MetaMask 注入...');
                return;
            }
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                console.log('检测到已连接账户，自动连接...');
                await connectWallet();
            } else {
                console.log('未检测到已连接账户');
            }
        } catch (error) {
            console.error('检查已连接账户失败:', error);
        }
    }
}

// 多种方式确保初始化执行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    // DOM 已经加载完成
    initializeApp();
}

// 也监听 window load 事件作为备用
window.addEventListener('load', function() {
    console.log('window load 事件触发');
    // 确保按钮事件已绑定
    const btn = document.getElementById('connectBtn');
    if (btn && !btn.onclick) {
        console.log('重新绑定连接按钮事件');
        btn.addEventListener('click', connectWallet);
        btn.onclick = connectWallet;
    }
});

