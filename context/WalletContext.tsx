import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { BrowserProvider, Contract, ethers } from 'ethers';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Order, OrderType} from '../types';

// ABI for the P2PEnergyTrading contract
const contractABI = [
	{
		"inputs": [
			{
				"internalType": "uint256[]",
				"name": "buyOrderIds",
				"type": "uint256[]"
			},
			{
				"internalType": "uint256[]",
				"name": "sellOrderIds",
				"type": "uint256[]"
			}
		],
		"name": "batchMatchOrders",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "orderId",
				"type": "uint256"
			}
		],
		"name": "cancelOrder",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "orderId",
				"type": "uint256"
			}
		],
		"name": "completeOrder",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "sellOrderId",
				"type": "uint256"
			}
		],
		"name": "directPurchase",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "_paymentToken",
				"type": "address"
			}
		],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "admin",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "FundsWithdrawn",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "orderId",
				"type": "uint256"
			}
		],
		"name": "OrderCancelled",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "orderId",
				"type": "uint256"
			}
		],
		"name": "OrderCompleted",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "buyOrderId",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "sellOrderId",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "matchedAmount",
				"type": "uint256"
			}
		],
		"name": "OrderMatched",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "orderId",
				"type": "uint256"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "user",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "enum P2PEnergyTrading.OrderType",
				"name": "orderType",
				"type": "uint8"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "price",
				"type": "uint256"
			}
		],
		"name": "OrderPlaced",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "enum P2PEnergyTrading.OrderType",
				"name": "orderType",
				"type": "uint8"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "price",
				"type": "uint256"
			}
		],
		"name": "placeOrder",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "withdrawFunds",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "getAllOrders",
		"outputs": [
			{
				"components": [
					{
						"internalType": "uint256",
						"name": "id",
						"type": "uint256"
					},
					{
						"internalType": "address",
						"name": "user",
						"type": "address"
					},
					{
						"internalType": "enum P2PEnergyTrading.OrderType",
						"name": "orderType",
						"type": "uint8"
					},
					{
						"internalType": "uint256",
						"name": "amount",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "price",
						"type": "uint256"
					},
					{
						"internalType": "enum P2PEnergyTrading.OrderStatus",
						"name": "status",
						"type": "uint8"
					}
				],
				"internalType": "struct P2PEnergyTrading.Order[]",
				"name": "",
				"type": "tuple[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "getOpenOrders",
		"outputs": [
			{
				"components": [
					{
						"internalType": "uint256",
						"name": "id",
						"type": "uint256"
					},
					{
						"internalType": "address",
						"name": "user",
						"type": "address"
					},
					{
						"internalType": "enum P2PEnergyTrading.OrderType",
						"name": "orderType",
						"type": "uint8"
					},
					{
						"internalType": "uint256",
						"name": "amount",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "price",
						"type": "uint256"
					},
					{
						"internalType": "enum P2PEnergyTrading.OrderStatus",
						"name": "status",
						"type": "uint8"
					}
				],
				"internalType": "struct P2PEnergyTrading.Order[]",
				"name": "",
				"type": "tuple[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "orderCount",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"name": "orders",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "id",
				"type": "uint256"
			},
			{
				"internalType": "address",
				"name": "user",
				"type": "address"
			},
			{
				"internalType": "enum P2PEnergyTrading.OrderType",
				"name": "orderType",
				"type": "uint8"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "price",
				"type": "uint256"
			},
			{
				"internalType": "enum P2PEnergyTrading.OrderStatus",
				"name": "status",
				"type": "uint8"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "owner",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "paymentToken",
		"outputs": [
			{
				"internalType": "contract IERC20",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"name": "userOrders",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
];
const tokenABI = [
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "initialSupply",
				"type": "uint256"
			}
		],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "owner",
				"type": "address"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "spender",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "value",
				"type": "uint256"
			}
		],
		"name": "Approval",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "from",
				"type": "address"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "to",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "value",
				"type": "uint256"
			}
		],
		"name": "Transfer",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"name": "allowance",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "spender",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "approve",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"name": "balanceOf",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "burn",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "decimals",
		"outputs": [
			{
				"internalType": "uint8",
				"name": "",
				"type": "uint8"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "to",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "mint",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "name",
		"outputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "owner",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "symbol",
		"outputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "totalSupply",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "to",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "transfer",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "from",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "to",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "transferFrom",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	}
];

// Interface for transaction data
export interface Transaction {
  orderId: string;
  type: string;
  energySold: string;
  pricePerKwh: string;
  earnings: string;
  status: string;
  date: string;
}

interface WalletContextType {
  account: string | null;
  connectWallet: () => Promise<void>;
  isConnected: boolean;
  placeOrder: (orderType: OrderType, amount: number, price: number) => Promise<void>;
  directPurchase: (sellOrderId: number) => Promise<void>;
  cancelOrder: (orderId: number) => Promise<void>;
  fetchOrders: () => Promise<Order[]>;
  fetchUserTransactions: () => Promise<Transaction[]>;
  isLoading: boolean;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

// Contract addresses - these would be replaced with actual deployed contract addresses
const CONTRACT_ADDRESS = "0x3F40a5194a94a93A463E891aDDFC22752291fdDB"; 
const TOKEN_ADDRESS = "0xBE9e34Bb09074e040B29371fC07d79944Df3dce8"; 

export const WalletProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [account, setAccount] = useState<string | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [tokenContract, setTokenContract] = useState<Contract | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Initialize provider and contracts when wallet is connected
  useEffect(() => {
    if (account && provider) {
      const initializeContracts = async () => {
        try {
          const signer = await provider.getSigner();
          const energyContract = new Contract(CONTRACT_ADDRESS, contractABI, signer);
          const erc20Contract = new Contract(TOKEN_ADDRESS, tokenABI, signer);

          setContract(energyContract);
          setTokenContract(erc20Contract);
          toast.success("Connected to energy trading contract");
        } catch (error) {
          console.error("Failed to initialize contracts:", error);
          toast.error("Failed to initialize contracts");
        }
      };

      initializeContracts();
    }
  }, [account, provider]);

  // Check if wallet is already connected
  useEffect(() => {
    const checkConnection = async () => {
      if (window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts.length > 0) {
            setAccount(accounts[0]);
            const ethersProvider = new BrowserProvider(window.ethereum);
            setProvider(ethersProvider);
          }
        } catch (error) {
          console.error("Failed to check wallet connection:", error);
        }
      }
    };

    checkConnection();

    // Listen for account changes
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
        } else {
          setAccount(null);
          setProvider(null);
          setContract(null);
          setTokenContract(null);
        }
      });
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeAllListeners('accountsChanged');
      }
    };
  }, []);

  const connectWallet = async () => {
    if (!window.ethereum) {
      toast.error("Please install MetaMask to use this application");
      return;
    }

    try {
      setIsLoading(true);
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setAccount(accounts[0]);
      const ethersProvider = new BrowserProvider(window.ethereum);
      setProvider(ethersProvider);
      toast.success("Wallet connected successfully");
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      toast.error("Failed to connect wallet");
    } finally {
      setIsLoading(false);
    }
  };

  const placeOrder = async (orderType: OrderType, amount: number, price: number) => {
    if (!contract || !tokenContract || !account) {
      toast.error("Wallet not connected");
      return;
    }

    try {
      setIsLoading(true);

      // Convert amount and price to wei (assuming 18 decimals)
      const amountInWei = ethers.parseUnits(amount.toString(), 0);
      const priceInWei = ethers.parseUnits(price.toString(), 18);

      // If buying, approve token spending first
      if (orderType === OrderType.BUY) {
        const totalCost = amountInWei * priceInWei;
        const allowance = await tokenContract.allowance(account, CONTRACT_ADDRESS);

        if (allowance < totalCost) {
          const approveTx = await tokenContract.approve(CONTRACT_ADDRESS, totalCost);
          await approveTx.wait();
          toast.success("Token approval successful");
        }
      }

      // Place the order
      const tx = await contract.placeOrder(orderType, amountInWei, priceInWei);
      await tx.wait();

      toast.success(`${OrderType[orderType]} order placed successfully`);
    } catch (error) {
      console.error("Failed to place order:", error);
      toast.error("Failed to place order");
    } finally {
      setIsLoading(false);
    }
  };

  const directPurchase = async (sellOrderId: number) => {
    if (!contract || !tokenContract || !account) {
      toast.error("Wallet not connected");
      return;
    }

    try {
      setIsLoading(true);

      // Get order details to calculate total cost
      const orderDetails = await contract.orders(sellOrderId);
      const totalCost = orderDetails.amount * orderDetails.price;

      // Approve token spending
      const allowance = await tokenContract.allowance(account, CONTRACT_ADDRESS);
      if (allowance < totalCost) {
        const approveTx = await tokenContract.approve(CONTRACT_ADDRESS, totalCost);
        await approveTx.wait();
        toast.success("Token approval successful");
      }

      // Execute purchase
      const tx = await contract.directPurchase(sellOrderId);
      await tx.wait();

      toast.success("Energy purchased successfully");
    } catch (error) {
      console.error("Failed to purchase energy:", error);
      toast.error("Failed to purchase energy");
    } finally {
      setIsLoading(false);
    }
  };

  const cancelOrder = async (orderId: number) => {
    if (!contract || !account) {
      toast.error("Wallet not connected");
      return;
    }

    try {
      setIsLoading(true);
      const tx = await contract.cancelOrder(orderId);
      await tx.wait();

      toast.success("Order cancelled successfully");
    } catch (error) {
      console.error("Failed to cancel order:", error);
      toast.error("Failed to cancel order");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchOrders = async () => {
    if (!contract) return [];

    try {
      const orders = await contract.getOpenOrders(); // Use getAllOrders() if needed
      return orders.map((order: any) => ({
        id: order.id.toString(),
        user: order.user,
        orderType: order.orderType === 0 ? OrderType.BUY : OrderType.SELL,
        amount: order.amount.toString(),
        price: order.price.toString(),
        status: ['OPEN', 'MATCHED', 'COMPLETED', 'CANCELLED'][order.status],
      }));
    } catch (error) {
      console.error('Error fetching orders:', error);
      return [];
    }
  };

  // New function to fetch user transactions
  const fetchUserTransactions = async (): Promise<Transaction[]> => {
    if (!contract || !account) return [];

    try {
      setIsLoading(true);
      
      // Get all orders from the contract
      const allOrders = await contract.getAllOrders();
      
      // Filter for user's orders
      const userTxs = allOrders.filter((order: any) => 
        order.user.toLowerCase() === account.toLowerCase()
      );
      
      // Format transactions for display
      const formattedTxs = userTxs.map((tx: any) => {
        // Convert order status to string
        const statusMap = ["Open", "Matched", "Completed", "Cancelled"];
        const statusText = statusMap[tx.status] || "Unknown";
        
        // Convert order type to string
        const typeText = tx.orderType === 0 ? "Buy" : "Sell";
        
        // Format date (using current date since blockchain doesn't store timestamps)
        const date = new Date().toISOString().split('T')[0];
        
        // Calculate earnings for sell orders - only "Completed" or "Matched" sell orders count as earnings
        const earnings = (tx.orderType === 1 && (tx.status === 1 || tx.status === 2)) 
          ? ethers.formatUnits(tx.amount * tx.price, 18)
          : "0";
        
        return {
          orderId: `#${tx.id.toString()}`,
          energySold: ethers.formatUnits(tx.amount, 0),
          pricePerKwh: ethers.formatUnits(tx.price, 18),
          earnings: parseFloat(earnings).toFixed(2),
          status: statusText,
          type: typeText,
          date: date
        };
      });
      
      return formattedTxs;
    } catch (error) {
      console.error("Error fetching user transactions:", error);
      toast.error("Failed to fetch transactions");
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <WalletContext.Provider
      value={{
        account,
        connectWallet,
        isConnected: !!account,
        placeOrder,
        directPurchase,
        cancelOrder,
        fetchOrders,
        fetchUserTransactions,
        isLoading
      }}
    >
      {children}
      <ToastContainer position="top-right" autoClose={5000} />
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};

// Add this to global Window interface
declare global {
  interface Window {
    ethereum: any;
  }
}