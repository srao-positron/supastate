#!/usr/bin/env npx tsx

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Simple TypeScript code with typed parameters
const testCode = `
// Test function with typed parameters
export function calculateTotal(
  items: Array<{ price: number; quantity: number }>,
  taxRate: number = 0.08,
  discount?: number
): { subtotal: number; tax: number; total: number } {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discountAmount = discount || 0;
  const taxableAmount = subtotal - discountAmount;
  const tax = taxableAmount * taxRate;
  const total = taxableAmount + tax;
  
  return {
    subtotal,
    tax,
    total
  };
}

// Class with typed methods
export class ShoppingCart {
  private items: Map<string, { price: number; quantity: number }>;
  
  constructor() {
    this.items = new Map();
  }
  
  addItem(id: string, price: number, quantity: number = 1): void {
    const existing = this.items.get(id);
    if (existing) {
      existing.quantity += quantity;
    } else {
      this.items.set(id, { price, quantity });
    }
  }
  
  removeItem(id: string): boolean {
    return this.items.delete(id);
  }
  
  getTotal(taxRate: number = 0.08): number {
    const items = Array.from(this.items.values());
    const result = calculateTotal(items, taxRate);
    return result.total;
  }
}

// Interface definition
export interface OrderSummary {
  orderId: string;
  items: Array<{
    productId: string;
    name: string;
    price: number;
    quantity: number;
  }>;
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  createdAt: Date;
}

// Type alias
export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed';

// Async function with Promise return type
export async function processPayment(
  order: OrderSummary,
  paymentMethod: string
): Promise<{ success: boolean; transactionId?: string; error?: string }> {
  try {
    // Simulate payment processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (Math.random() > 0.1) {
      return {
        success: true,
        transactionId: \`txn_\${Date.now()}\`
      };
    } else {
      throw new Error('Payment failed');
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
`;

async function testParseCode() {
  console.log('Testing parse-code edge function...\n');
  
  try {
    // Call the edge function
    const { data, error } = await supabase.functions.invoke('parse-code', {
      body: {
        code: testCode,
        language: 'typescript',
        filename: 'test-shopping-cart.ts'
      }
    });

    if (error) {
      console.error('Edge function error:', error);
      return;
    }

    console.log('Parse result:', JSON.stringify(data, null, 2));
    
    // Analyze the result
    if (data && data.entities) {
      console.log('\n=== Analysis ===');
      console.log(`Total entities found: ${data.entities.length}`);
      
      // Group by type
      const byType = data.entities.reduce((acc: any, entity: any) => {
        acc[entity.type] = (acc[entity.type] || 0) + 1;
        return acc;
      }, {});
      
      console.log('\nEntities by type:', byType);
      
      // Check for typed parameters
      console.log('\n=== Checking for typed parameters ===');
      data.entities.forEach((entity: any) => {
        if (entity.type === 'function' || entity.type === 'method') {
          console.log(`\n${entity.type}: ${entity.name}`);
          
          // Check metadata for parameters
          if (entity.metadata) {
            const metadata = typeof entity.metadata === 'string' 
              ? JSON.parse(entity.metadata) 
              : entity.metadata;
            
            if (metadata.params && metadata.params.length > 0) {
              console.log('  Parameters:');
              metadata.params.forEach((param: any) => {
                console.log(`    - ${param.name}: ${param.type || 'any'}`);
              });
            } else {
              console.log('  No parameters found in metadata');
            }
            
            if (metadata.returns) {
              console.log(`  Returns: ${metadata.returns}`);
            }
          } else {
            console.log('  No metadata found');
          }
        }
      });
      
      // Check relationships
      if (data.relationships && data.relationships.length > 0) {
        console.log('\n=== Relationships ===');
        console.log(`Total relationships: ${data.relationships.length}`);
        
        const relByType = data.relationships.reduce((acc: any, rel: any) => {
          acc[rel.type] = (acc[rel.type] || 0) + 1;
          return acc;
        }, {});
        
        console.log('Relationships by type:', relByType);
      }
    }
    
  } catch (err) {
    console.error('Test failed:', err);
  }
}

// Run the test
testParseCode();