// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract EnergyToken {
    string public name = "Energy Token";
    string public symbol = "ENGT";
    uint8 public decimals = 1;
    uint256 public totalSupply;
    address public owner;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    constructor(uint256 initialSupply) {
        owner = msg.sender;
        totalSupply = initialSupply * 10 ** uint256(decimals);
        balanceOf[msg.sender] = totalSupply;
        emit Transfer(address(0), msg.sender, totalSupply);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        _transfer(msg.sender, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "Invalid recipient");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Allowance exceeded");
        
        allowance[from][msg.sender] -= amount;
        _transfer(from, to, amount);
        return true;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        uint256 mintedAmount = amount * 10 ** uint256(decimals);
        totalSupply += mintedAmount;
        balanceOf[to] += mintedAmount;
        emit Transfer(address(0), to, mintedAmount);
    }

    function burn(uint256 amount) external {
        uint256 burnedAmount = amount * 10 ** uint256(decimals);
        require(balanceOf[msg.sender] >= burnedAmount, "Insufficient balance");
        totalSupply -= burnedAmount;
        balanceOf[msg.sender] -= burnedAmount;
        emit Transfer(msg.sender, address(0), burnedAmount);
    }
}
