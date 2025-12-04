// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title CarbonCreditRWA
 * @dev 碳信用 RWA 代币化合约，支持多批次碳信用铸造、转账、注销销毁（Retirement Burn）
 * 核心特性：链上认证信息存储、注销永久销毁、不可篡改 ESG 记录、多权限控制
 */
contract CarbonCreditRWA is ERC1155, Ownable, Pausable, ReentrancyGuard {
    // ==================== 数据结构定义 ====================
    /**
     * @dev 碳信用批次元数据（每批次对应唯一链下核证碳信用）
     * @param batchId 批次唯一ID
     * @param projectName 减排项目名称（如"云南光伏电站"）
     * @param verificationBody 第三方核证机构地址（如Verra授权机构）
     * @param totalEmissionReduction 总减排量（单位：吨CO₂当量）
     * @param issuedDate 发行日期（时间戳）
     * @param expiryDate 有效期（0表示永久有效）
     * @param verificationDocHash IPFS上核证报告的哈希值（用于链下验证）
     * @param isVerified 是否通过核证（仅核证机构可设置）
     * @param burnedAmount 已注销销毁的数量
     */
    struct CarbonCreditBatch {
        uint256 batchId;
        string projectName;
        address verificationBody;
        uint256 totalEmissionReduction;
        uint256 issuedDate;
        uint256 expiryDate;
        string verificationDocHash;
        bool isVerified;
        uint256 burnedAmount;
    }

    // ==================== 状态变量 ====================
    // 批次ID计数器（自增生成唯一批次ID）
    uint256 public nextBatchId;
    // 批次ID -> 碳信用批次元数据
    mapping(uint256 => CarbonCreditBatch) public carbonCreditBatches;
    // 地址 -> 是否为授权核证机构（仅核证机构可核证批次）
    mapping(address => bool) public authorizedVerificationBodies;
    // 批次ID -> 已铸造总量（防止超发）
    mapping(uint256 => uint256) public totalMintedPerBatch;

    // ==================== 事件定义（ESG可追溯核心） ====================
    /**
     * @dev 碳信用批次创建事件（记录批次基础信息）
     */
    event CarbonCreditBatchCreated(
        uint256 indexed batchId,
        string projectName,
        address indexed verificationBody,
        uint256 totalEmissionReduction,
        uint256 issuedDate,
        uint256 expiryDate,
        string verificationDocHash
    );

    /**
     * @dev 碳信用批次核证通过事件（记录核证机构与时间）
     */
    event CarbonCreditBatchVerified(
        uint256 indexed batchId,
        address indexed verificationBody,
        uint256 verifiedAt
    );

    /**
     * @dev 碳信用代币铸造事件（记录铸造信息，防止双重计数）
     */
    event CarbonCreditMinted(
        address indexed minter,
        uint256 indexed batchId,
        uint256 amount,
        uint256 mintedAt
    );

    /**
     * @dev 碳信用注销销毁事件（ESG报告核心凭证，不可篡改）
     */
    event CarbonCreditRetiredAndBurned(
        address indexed company, // 注销企业地址
        uint256 indexed batchId, // 碳信用批次ID
        uint256 amount, // 注销数量（吨CO₂当量）
        string esgReportReference, // 企业ESG报告编号（可选）
        uint256 retiredAt // 注销时间戳
    );

    /**
     * @dev 授权核证机构事件
     */
    event VerificationBodyAuthorized(address indexed verificationBody, uint256 authorizedAt);

    // ====================  modifier 权限控制 ====================
    /**
     * @dev 仅授权核证机构可调用
     */
    modifier onlyVerifiedBody() {
        require(authorizedVerificationBodies[msg.sender], "Not authorized verification body");
        _;
    }

    /**
     * @dev 仅已核证的批次可操作
     */
    modifier onlyVerifiedBatch(uint256 batchId) {
        require(carbonCreditBatches[batchId].isVerified, "Batch not verified");
        _;
    }

    /**
     * @dev 批次未过期
     */
    modifier batchNotExpired(uint256 batchId) {
        CarbonCreditBatch storage batch = carbonCreditBatches[batchId];
        require(batch.expiryDate == 0 || block.timestamp < batch.expiryDate, "Batch expired");
        _;
    }

    // ==================== 构造函数 ====================
    constructor() ERC1155("https://ipfs.example.com/carbon-credit/{id}.json") Ownable(msg.sender) {
        nextBatchId = 1; // 批次ID从1开始
    }

    // ==================== 核心功能实现 ====================
    /**
     * @dev 授权第三方核证机构（仅合约所有者可操作）
     * @param verificationBody 核证机构地址
     */
    function authorizeVerificationBody(address verificationBody) external onlyOwner {
        require(verificationBody != address(0), "Invalid address");
        require(!authorizedVerificationBodies[verificationBody], "Already authorized");
        authorizedVerificationBodies[verificationBody] = true;
        emit VerificationBodyAuthorized(verificationBody, block.timestamp);
    }

    /**
     * @dev 创建碳信用批次（核证机构发起，记录基础信息）
     * @param projectName 减排项目名称
     * @param totalEmissionReduction 总减排量（吨CO₂当量）
     * @param expiryDate 有效期（0表示永久）
     * @param verificationDocHash IPFS核证报告哈希
     * @return batchId 新创建的批次ID
     */
    function createCarbonCreditBatch(
        string calldata projectName,
        uint256 totalEmissionReduction,
        uint256 expiryDate,
        string calldata verificationDocHash
    ) external onlyVerifiedBody returns (uint256) {
        require(totalEmissionReduction > 0, "Reduction amount must be positive");
        require(bytes(projectName).length > 0, "Project name cannot be empty");
        require(bytes(verificationDocHash).length > 0, "Verification doc hash required");

        uint256 batchId = nextBatchId++;
        CarbonCreditBatch storage batch = carbonCreditBatches[batchId];

        batch.batchId = batchId;
        batch.projectName = projectName;
        batch.verificationBody = msg.sender;
        batch.totalEmissionReduction = totalEmissionReduction;
        batch.issuedDate = block.timestamp;
        batch.expiryDate = expiryDate;
        batch.verificationDocHash = verificationDocHash;
        batch.isVerified = false; // 初始未核证
        batch.burnedAmount = 0;

        emit CarbonCreditBatchCreated(
            batchId,
            projectName,
            msg.sender,
            totalEmissionReduction,
            block.timestamp,
            expiryDate,
            verificationDocHash
        );

        return batchId;
    }

    /**
     * @dev 核证碳信用批次（核证机构确认批次真实性，仅创建者可核证）
     * @param batchId 批次ID
     */
    function verifyCarbonCreditBatch(uint256 batchId) external onlyVerifiedBody {
        CarbonCreditBatch storage batch = carbonCreditBatches[batchId];
        require(batch.verificationBody == msg.sender, "Only batch creator can verify");
        require(!batch.isVerified, "Batch already verified");

        batch.isVerified = true;
        emit CarbonCreditBatchVerified(batchId, msg.sender, block.timestamp);
    }

    /**
     * @dev 铸造碳信用代币（仅合约所有者+已核证批次，1代币=1吨CO₂当量）
     * @param to 接收者地址（企业/投资者）
     * @param batchId 批次ID
     * @param amount 铸造数量
     */
    function mintCarbonCredit(
        address to,
        uint256 batchId,
        uint256 amount
    ) external onlyOwner onlyVerifiedBatch(batchId) batchNotExpired(batchId) nonReentrant {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Mint amount must be positive");

        CarbonCreditBatch storage batch = carbonCreditBatches[batchId];
        // 确保铸造总量不超过批次总减排量
        require(
            totalMintedPerBatch[batchId] + amount <= batch.totalEmissionReduction,
            "Exceeds total reduction amount"
        );

        _mint(to, batchId, amount, "");
        totalMintedPerBatch[batchId] += amount;

        emit CarbonCreditMinted(msg.sender, batchId, amount, block.timestamp);
    }

    /**
     * @dev 核心功能：注销销毁碳信用（企业用于ESG抵消，永久销毁不可恢复）
     * @param batchId 批次ID
     * @param amount 注销数量
     * @param esgReportReference 企业ESG报告编号（可选，用于审计关联）
     */
    function retireAndBurnCarbonCredit(
        uint256 batchId,
        uint256 amount,
        string calldata esgReportReference
    ) external onlyVerifiedBatch(batchId) batchNotExpired(batchId) nonReentrant {
        require(amount > 0, "Retire amount must be positive");
        // 检查调用者余额是否充足
        require(balanceOf(msg.sender, batchId) >= amount, "Insufficient balance");

        CarbonCreditBatch storage batch = carbonCreditBatches[batchId];

        // 销毁代币（永久移除流通）
        _burn(msg.sender, batchId, amount);
        // 更新批次已销毁数量
        batch.burnedAmount += amount;

        // 触发ESG可追溯事件（链上永久记录）
        emit CarbonCreditRetiredAndBurned(
            msg.sender,
            batchId,
            amount,
            esgReportReference,
            block.timestamp
        );
    }

    // ==================== 查询功能（ESG审计/验证用） ====================
    /**
     * @dev 获取批次完整信息（审计机构/监管部门查询）
     * @param batchId 批次ID
     * @return 批次元数据
     */
    function getCarbonCreditBatch(uint256 batchId) external view returns (CarbonCreditBatch memory) {
        return carbonCreditBatches[batchId];
    }

    /**
     * @dev 查询批次剩余可流通数量（总减排量 - 已铸造量）
     * @param batchId 批次ID
     * @return 剩余数量
     */
    function getBatchRemainingSupply(uint256 batchId) external view returns (uint256) {
        CarbonCreditBatch storage batch = carbonCreditBatches[batchId];
        return batch.totalEmissionReduction - totalMintedPerBatch[batchId];
    }

    /**
     * @dev 查询企业某批次的注销记录（通过事件过滤，此处提供接口示例）
     * 实际审计可通过区块链浏览器过滤 CarbonCreditRetiredAndBurned 事件
     */
    function getCompanyRetirementHistory(
        address company,
        uint256 batchId
    ) external view returns (uint256 totalRetired) {
        // 注：完整历史需通过事件日志查询，此处仅返回该批次总注销量
        CarbonCreditBatch storage batch = carbonCreditBatches[batchId];
        // 实际项目可维护 mapping(address => mapping(uint256 => uint256)) companyRetiredAmount 存储
        return batch.burnedAmount;
    }

    // ==================== 紧急控制功能 ====================
    /**
     * @dev 暂停合约（紧急情况，如发现批次造假）
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev 恢复合约
     */
    function unpause() external onlyOwner {
        _unpause();
    }


}