export enum OrderType {
  BUY = 0,
  SELL = 1
}

export enum OrderStatus {
  OPEN = 0,
  MATCHED = 1,
  COMPLETED = 2,
  CANCELLED = 3
}

export interface Order {
  id: number;
  user: string;
  orderType: OrderType;
  amount: number; // in kWh
  price: number;  // price per kWh in token units
  status: OrderStatus;
}

export interface CreateOrderFormData {
  amount: number;
  price: number;
}