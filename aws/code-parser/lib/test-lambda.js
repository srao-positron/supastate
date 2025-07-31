"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_lambda_1 = require("@aws-sdk/client-lambda");
const client = new client_lambda_1.LambdaClient({ region: 'us-east-1' });
// Test cases
const testCases = [
    {
        name: 'TypeScript with React',
        payload: {
            code: `
import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { User } from './types';

interface DashboardProps {
  user: User;
  onLogout: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, onLogout }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const response = await fetch('/api/data');
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1>Welcome {user.name}</h1>
      {loading ? <p>Loading...</p> : <DataList items={data} />}
    </div>
  );
};

export class UserService {
  private supabase = createClient('url', 'key');

  async getProfile(userId: string): Promise<User> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) throw error;
    return data;
  }
}
      `,
            language: 'typescript',
            filename: 'Dashboard.tsx'
        }
    },
    {
        name: 'Python with async',
        payload: {
            code: `
import asyncio
import pandas as pd
from typing import List, Dict, Optional
from dataclasses import dataclass

@dataclass
class User:
    id: str
    name: str
    email: str

class DataProcessor:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.session = None
    
    async def process_batch(self, items: List[Dict]) -> pd.DataFrame:
        """Process a batch of items and return as DataFrame"""
        try:
            df = pd.DataFrame(items)
            df['processed'] = True
            return df
        except Exception as e:
            print(f"Error processing batch: {e}")
            raise
    
    def analyze(self, df: pd.DataFrame) -> Dict[str, any]:
        return {
            "rows": len(df),
            "columns": list(df.columns),
            "memory_usage": df.memory_usage().sum()
        }

async def main():
    processor = DataProcessor("test-key")
    data = [{"id": 1, "value": 100}, {"id": 2, "value": 200}]
    result = await processor.process_batch(data)
    print(result)
      `,
            language: 'python',
            filename: 'processor.py'
        }
    }
];
async function testLambda() {
    console.log('Testing Code Parser Lambda...\n');
    for (const testCase of testCases) {
        console.log(`\n=== Testing ${testCase.name} ===`);
        try {
            const command = new client_lambda_1.InvokeCommand({
                FunctionName: 'supastate-code-parser',
                Payload: Buffer.from(JSON.stringify(testCase.payload))
            });
            const response = await client.send(command);
            const result = JSON.parse(new TextDecoder().decode(response.Payload));
            console.log('Result:', JSON.stringify(result, null, 2));
        }
        catch (error) {
            console.error('Error:', error);
        }
    }
}
testLambda();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdC1sYW1iZGEuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi90ZXN0LWxhbWJkYS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLDBEQUFxRTtBQUVyRSxNQUFNLE1BQU0sR0FBRyxJQUFJLDRCQUFZLENBQUMsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQztBQUV6RCxhQUFhO0FBQ2IsTUFBTSxTQUFTLEdBQUc7SUFDaEI7UUFDRSxJQUFJLEVBQUUsdUJBQXVCO1FBQzdCLE9BQU8sRUFBRTtZQUNQLElBQUksRUFBRTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7T0FxREw7WUFDRCxRQUFRLEVBQUUsWUFBWTtZQUN0QixRQUFRLEVBQUUsZUFBZTtTQUMxQjtLQUNGO0lBQ0Q7UUFDRSxJQUFJLEVBQUUsbUJBQW1CO1FBQ3pCLE9BQU8sRUFBRTtZQUNQLElBQUksRUFBRTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O09BdUNMO1lBQ0QsUUFBUSxFQUFFLFFBQVE7WUFDbEIsUUFBUSxFQUFFLGNBQWM7U0FDekI7S0FDRjtDQUNGLENBQUM7QUFFRixLQUFLLFVBQVUsVUFBVTtJQUN2QixPQUFPLENBQUMsR0FBRyxDQUFDLGlDQUFpQyxDQUFDLENBQUM7SUFFL0MsS0FBSyxNQUFNLFFBQVEsSUFBSSxTQUFTLEVBQUUsQ0FBQztRQUNqQyxPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFpQixRQUFRLENBQUMsSUFBSSxNQUFNLENBQUMsQ0FBQztRQUVsRCxJQUFJLENBQUM7WUFDSCxNQUFNLE9BQU8sR0FBRyxJQUFJLDZCQUFhLENBQUM7Z0JBQ2hDLFlBQVksRUFBRSx1QkFBdUI7Z0JBQ3JDLE9BQU8sRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO2FBQ3ZELENBQUMsQ0FBQztZQUVILE1BQU0sUUFBUSxHQUFHLE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUM1QyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksV0FBVyxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxPQUFRLENBQUMsQ0FBQyxDQUFDO1lBRXZFLE9BQU8sQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzFELENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDakMsQ0FBQztJQUNILENBQUM7QUFDSCxDQUFDO0FBRUQsVUFBVSxFQUFFLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBMYW1iZGFDbGllbnQsIEludm9rZUNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtbGFtYmRhJztcblxuY29uc3QgY2xpZW50ID0gbmV3IExhbWJkYUNsaWVudCh7IHJlZ2lvbjogJ3VzLWVhc3QtMScgfSk7XG5cbi8vIFRlc3QgY2FzZXNcbmNvbnN0IHRlc3RDYXNlcyA9IFtcbiAge1xuICAgIG5hbWU6ICdUeXBlU2NyaXB0IHdpdGggUmVhY3QnLFxuICAgIHBheWxvYWQ6IHtcbiAgICAgIGNvZGU6IGBcbmltcG9ydCBSZWFjdCwgeyB1c2VTdGF0ZSwgdXNlRWZmZWN0IH0gZnJvbSAncmVhY3QnO1xuaW1wb3J0IHsgY3JlYXRlQ2xpZW50IH0gZnJvbSAnQHN1cGFiYXNlL3N1cGFiYXNlLWpzJztcbmltcG9ydCB0eXBlIHsgVXNlciB9IGZyb20gJy4vdHlwZXMnO1xuXG5pbnRlcmZhY2UgRGFzaGJvYXJkUHJvcHMge1xuICB1c2VyOiBVc2VyO1xuICBvbkxvZ291dDogKCkgPT4gdm9pZDtcbn1cblxuZXhwb3J0IGNvbnN0IERhc2hib2FyZDogUmVhY3QuRkM8RGFzaGJvYXJkUHJvcHM+ID0gKHsgdXNlciwgb25Mb2dvdXQgfSkgPT4ge1xuICBjb25zdCBbbG9hZGluZywgc2V0TG9hZGluZ10gPSB1c2VTdGF0ZShmYWxzZSk7XG4gIGNvbnN0IFtkYXRhLCBzZXREYXRhXSA9IHVzZVN0YXRlPGFueVtdPihbXSk7XG5cbiAgdXNlRWZmZWN0KCgpID0+IHtcbiAgICBmZXRjaERhdGEoKTtcbiAgfSwgW10pO1xuXG4gIGFzeW5jIGZ1bmN0aW9uIGZldGNoRGF0YSgpIHtcbiAgICBzZXRMb2FkaW5nKHRydWUpO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCcvYXBpL2RhdGEnKTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgICAgIHNldERhdGEocmVzdWx0KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGZldGNoIGRhdGE6JywgZXJyb3IpO1xuICAgIH0gZmluYWxseSB7XG4gICAgICBzZXRMb2FkaW5nKGZhbHNlKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gKFxuICAgIDxkaXY+XG4gICAgICA8aDE+V2VsY29tZSB7dXNlci5uYW1lfTwvaDE+XG4gICAgICB7bG9hZGluZyA/IDxwPkxvYWRpbmcuLi48L3A+IDogPERhdGFMaXN0IGl0ZW1zPXtkYXRhfSAvPn1cbiAgICA8L2Rpdj5cbiAgKTtcbn07XG5cbmV4cG9ydCBjbGFzcyBVc2VyU2VydmljZSB7XG4gIHByaXZhdGUgc3VwYWJhc2UgPSBjcmVhdGVDbGllbnQoJ3VybCcsICdrZXknKTtcblxuICBhc3luYyBnZXRQcm9maWxlKHVzZXJJZDogc3RyaW5nKTogUHJvbWlzZTxVc2VyPiB7XG4gICAgY29uc3QgeyBkYXRhLCBlcnJvciB9ID0gYXdhaXQgdGhpcy5zdXBhYmFzZVxuICAgICAgLmZyb20oJ3Byb2ZpbGVzJylcbiAgICAgIC5zZWxlY3QoJyonKVxuICAgICAgLmVxKCdpZCcsIHVzZXJJZClcbiAgICAgIC5zaW5nbGUoKTtcbiAgICBcbiAgICBpZiAoZXJyb3IpIHRocm93IGVycm9yO1xuICAgIHJldHVybiBkYXRhO1xuICB9XG59XG4gICAgICBgLFxuICAgICAgbGFuZ3VhZ2U6ICd0eXBlc2NyaXB0JyxcbiAgICAgIGZpbGVuYW1lOiAnRGFzaGJvYXJkLnRzeCdcbiAgICB9XG4gIH0sXG4gIHtcbiAgICBuYW1lOiAnUHl0aG9uIHdpdGggYXN5bmMnLFxuICAgIHBheWxvYWQ6IHtcbiAgICAgIGNvZGU6IGBcbmltcG9ydCBhc3luY2lvXG5pbXBvcnQgcGFuZGFzIGFzIHBkXG5mcm9tIHR5cGluZyBpbXBvcnQgTGlzdCwgRGljdCwgT3B0aW9uYWxcbmZyb20gZGF0YWNsYXNzZXMgaW1wb3J0IGRhdGFjbGFzc1xuXG5AZGF0YWNsYXNzXG5jbGFzcyBVc2VyOlxuICAgIGlkOiBzdHJcbiAgICBuYW1lOiBzdHJcbiAgICBlbWFpbDogc3RyXG5cbmNsYXNzIERhdGFQcm9jZXNzb3I6XG4gICAgZGVmIF9faW5pdF9fKHNlbGYsIGFwaV9rZXk6IHN0cik6XG4gICAgICAgIHNlbGYuYXBpX2tleSA9IGFwaV9rZXlcbiAgICAgICAgc2VsZi5zZXNzaW9uID0gTm9uZVxuICAgIFxuICAgIGFzeW5jIGRlZiBwcm9jZXNzX2JhdGNoKHNlbGYsIGl0ZW1zOiBMaXN0W0RpY3RdKSAtPiBwZC5EYXRhRnJhbWU6XG4gICAgICAgIFwiXCJcIlByb2Nlc3MgYSBiYXRjaCBvZiBpdGVtcyBhbmQgcmV0dXJuIGFzIERhdGFGcmFtZVwiXCJcIlxuICAgICAgICB0cnk6XG4gICAgICAgICAgICBkZiA9IHBkLkRhdGFGcmFtZShpdGVtcylcbiAgICAgICAgICAgIGRmWydwcm9jZXNzZWQnXSA9IFRydWVcbiAgICAgICAgICAgIHJldHVybiBkZlxuICAgICAgICBleGNlcHQgRXhjZXB0aW9uIGFzIGU6XG4gICAgICAgICAgICBwcmludChmXCJFcnJvciBwcm9jZXNzaW5nIGJhdGNoOiB7ZX1cIilcbiAgICAgICAgICAgIHJhaXNlXG4gICAgXG4gICAgZGVmIGFuYWx5emUoc2VsZiwgZGY6IHBkLkRhdGFGcmFtZSkgLT4gRGljdFtzdHIsIGFueV06XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBcInJvd3NcIjogbGVuKGRmKSxcbiAgICAgICAgICAgIFwiY29sdW1uc1wiOiBsaXN0KGRmLmNvbHVtbnMpLFxuICAgICAgICAgICAgXCJtZW1vcnlfdXNhZ2VcIjogZGYubWVtb3J5X3VzYWdlKCkuc3VtKClcbiAgICAgICAgfVxuXG5hc3luYyBkZWYgbWFpbigpOlxuICAgIHByb2Nlc3NvciA9IERhdGFQcm9jZXNzb3IoXCJ0ZXN0LWtleVwiKVxuICAgIGRhdGEgPSBbe1wiaWRcIjogMSwgXCJ2YWx1ZVwiOiAxMDB9LCB7XCJpZFwiOiAyLCBcInZhbHVlXCI6IDIwMH1dXG4gICAgcmVzdWx0ID0gYXdhaXQgcHJvY2Vzc29yLnByb2Nlc3NfYmF0Y2goZGF0YSlcbiAgICBwcmludChyZXN1bHQpXG4gICAgICBgLFxuICAgICAgbGFuZ3VhZ2U6ICdweXRob24nLFxuICAgICAgZmlsZW5hbWU6ICdwcm9jZXNzb3IucHknXG4gICAgfVxuICB9XG5dO1xuXG5hc3luYyBmdW5jdGlvbiB0ZXN0TGFtYmRhKCkge1xuICBjb25zb2xlLmxvZygnVGVzdGluZyBDb2RlIFBhcnNlciBMYW1iZGEuLi5cXG4nKTtcbiAgXG4gIGZvciAoY29uc3QgdGVzdENhc2Ugb2YgdGVzdENhc2VzKSB7XG4gICAgY29uc29sZS5sb2coYFxcbj09PSBUZXN0aW5nICR7dGVzdENhc2UubmFtZX0gPT09YCk7XG4gICAgXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNvbW1hbmQgPSBuZXcgSW52b2tlQ29tbWFuZCh7XG4gICAgICAgIEZ1bmN0aW9uTmFtZTogJ3N1cGFzdGF0ZS1jb2RlLXBhcnNlcicsXG4gICAgICAgIFBheWxvYWQ6IEJ1ZmZlci5mcm9tKEpTT04uc3RyaW5naWZ5KHRlc3RDYXNlLnBheWxvYWQpKVxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2xpZW50LnNlbmQoY29tbWFuZCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBKU09OLnBhcnNlKG5ldyBUZXh0RGVjb2RlcigpLmRlY29kZShyZXNwb25zZS5QYXlsb2FkISkpO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZygnUmVzdWx0OicsIEpTT04uc3RyaW5naWZ5KHJlc3VsdCwgbnVsbCwgMikpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvcjonLCBlcnJvcik7XG4gICAgfVxuICB9XG59XG5cbnRlc3RMYW1iZGEoKTsiXX0=