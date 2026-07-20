import React, { createContext, useContext, useState } from 'react';
import type { Product } from './api';

export interface CartLine {
  product: Product;
  quantity: number;
}

interface CartState {
  lines: CartLine[];
  merchantId: string | null;
  merchantName: string | null;
  count: number;
  total: number;
  // Adds one unit. Returns 'conflict' (without changing the cart) when the product is from a
  // different merchant than what's already in the cart -- one order, one merchant.
  tryAdd: (product: Product) => 'added' | 'conflict';
  // Empties the cart and adds the product (used after the user confirms switching merchant).
  replaceWith: (product: Product) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
}

const CartContext = createContext<CartState | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);

  const merchantId = lines[0]?.product.companyId ?? null;
  const merchantName = lines[0]?.product.companyName ?? null;
  const count = lines.reduce((sum, l) => sum + l.quantity, 0);
  const total = lines.reduce((sum, l) => sum + l.quantity * l.product.price, 0);

  const addUnit = (list: CartLine[], product: Product): CartLine[] => {
    const existing = list.find((l) => l.product.id === product.id);
    if (existing) return list.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l));
    return [...list, { product, quantity: 1 }];
  };

  const tryAdd = (product: Product): 'added' | 'conflict' => {
    if (merchantId && product.companyId !== merchantId) return 'conflict';
    setLines((prev) => addUnit(prev, product));
    return 'added';
  };

  const replaceWith = (product: Product) => setLines(addUnit([], product));

  const setQuantity = (productId: string, quantity: number) =>
    setLines((prev) => (quantity <= 0
      ? prev.filter((l) => l.product.id !== productId)
      : prev.map((l) => (l.product.id === productId ? { ...l, quantity } : l))));

  const clear = () => setLines([]);

  return (
    <CartContext.Provider value={{ lines, merchantId, merchantName, count, total, tryAdd, replaceWith, setQuantity, clear }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
