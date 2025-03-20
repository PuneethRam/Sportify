// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract P2PEnergyTrading {
    IERC20 public paymentToken; // USDC or any ERC20 token
    address public owner;
    uint256 public orderCount;

    enum OrderType { BUY, SELL }
    enum OrderStatus { OPEN, MATCHED, COMPLETED, CANCELLED }

    struct Order {
        uint256 id;
        address user;
        OrderType orderType;
        uint256 amount; // in kWh
        uint256 price;  // price per kWh in token units
        OrderStatus status;
    }

    mapping(uint256 => Order) public orders;
    mapping(address => uint256[]) public userOrders;

    event OrderPlaced(uint256 orderId, address indexed user, OrderType orderType, uint256 amount, uint256 price);
    event OrderMatched(uint256 buyOrderId, uint256 sellOrderId, uint256 matchedAmount);
    event OrderCompleted(uint256 orderId);
    event OrderCancelled(uint256 orderId);
    event FundsWithdrawn(address indexed admin, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    constructor(address _paymentToken) {
        paymentToken = IERC20(_paymentToken);
        owner = msg.sender;
    }

    function placeOrder(OrderType orderType, uint256 amount, uint256 price) external {
        require(amount > 0 && price > 0, "Invalid order values");

        if (orderType == OrderType.BUY) {
            uint256 totalCost = amount * price;
            paymentToken.transferFrom(msg.sender, address(this), totalCost);
        }

        orderCount++;
        orders[orderCount] = Order(orderCount, msg.sender, orderType, amount, price, OrderStatus.OPEN);
        userOrders[msg.sender].push(orderCount);
        
        emit OrderPlaced(orderCount, msg.sender, orderType, amount, price);
    }

    function batchMatchOrders(uint256[] memory buyOrderIds, uint256[] memory sellOrderIds) external onlyOwner {
        require(buyOrderIds.length == sellOrderIds.length, "Mismatched order lists");

        for (uint256 i = 0; i < buyOrderIds.length; i++) {
            Order storage buyOrder = orders[buyOrderIds[i]];
            Order storage sellOrder = orders[sellOrderIds[i]];

            require(buyOrder.status == OrderStatus.OPEN, "Buy order not open");
            require(sellOrder.status == OrderStatus.OPEN, "Sell order not open");
            require(buyOrder.price >= sellOrder.price, "Price mismatch");

            uint256 matchedAmount = buyOrder.amount < sellOrder.amount ? buyOrder.amount : sellOrder.amount;
            uint256 totalPayment = matchedAmount * sellOrder.price;

            paymentToken.transfer(sellOrder.user, totalPayment);

            buyOrder.amount -= matchedAmount;
            sellOrder.amount -= matchedAmount;

            if (buyOrder.amount == 0) buyOrder.status = OrderStatus.MATCHED;
            if (sellOrder.amount == 0) sellOrder.status = OrderStatus.MATCHED;

            emit OrderMatched(buyOrder.id, sellOrder.id, matchedAmount);
        }
    }

    function completeOrder(uint256 orderId) external onlyOwner {
        require(orders[orderId].status == OrderStatus.MATCHED, "Order not matched");
        orders[orderId].status = OrderStatus.COMPLETED;
        emit OrderCompleted(orderId);
    }

    function cancelOrder(uint256 orderId) external {
        require(orders[orderId].user == msg.sender, "Not order owner");
        require(orders[orderId].status == OrderStatus.OPEN, "Order not open");

        if (orders[orderId].orderType == OrderType.BUY) {
            uint256 refundAmount = orders[orderId].amount * orders[orderId].price;
            paymentToken.transfer(msg.sender, refundAmount);
        }

        orders[orderId].status = OrderStatus.CANCELLED;
        emit OrderCancelled(orderId);
    }

    function directPurchase(uint256 sellOrderId) external {
        Order storage sellOrder = orders[sellOrderId];
        require(sellOrder.status == OrderStatus.OPEN, "Sell order not available");

        uint256 totalCost = sellOrder.amount * sellOrder.price;
        paymentToken.transferFrom(msg.sender, sellOrder.user, totalCost);

        sellOrder.status = OrderStatus.COMPLETED;
        emit OrderCompleted(sellOrderId);
    }

    function withdrawFunds(uint256 amount) external onlyOwner {
        require(paymentToken.balanceOf(address(this)) >= amount, "Insufficient contract balance");
        paymentToken.transfer(owner, amount);
        emit FundsWithdrawn(owner, amount);
    }

    function getAllOrders() external view returns (Order[] memory) {
    Order[] memory allOrders = new Order[](orderCount);
    for (uint256 i = 1; i <= orderCount; i++) {
        allOrders[i - 1] = orders[i];
    }
    return allOrders;
    }

    function getOpenOrders() external view returns (Order[] memory) {
    uint256 openOrderCount = 0;

    // Count open orders first
    for (uint256 i = 1; i <= orderCount; i++) {
        if (orders[i].status == OrderStatus.OPEN) {
            openOrderCount++;
        }
    }

    // Create an array for open orders
    Order[] memory openOrders = new Order[](openOrderCount);
    uint256 index = 0;
    for (uint256 i = 1; i <= orderCount; i++) {
        if (orders[i].status == OrderStatus.OPEN) {
            openOrders[index] = orders[i];
            index++;
        }
    }
    return openOrders;
    }


}
