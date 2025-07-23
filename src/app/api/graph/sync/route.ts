import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analyzeCodebase } from '@/lib/api/graph';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { repository, branch = 'main' } = body;

    if (!repository) {
      return NextResponse.json({ error: 'Repository path is required' }, { status: 400 });
    }

    // Analyze the codebase and generate graph data
    const graphData = await analyzeCodebase(repository);

    return NextResponse.json({
      success: true,
      data: graphData,
      message: 'Code graph generated successfully',
    });
  } catch (error) {
    console.error('Error syncing code graph:', error);
    return NextResponse.json(
      { error: 'Failed to sync code graph' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const repository = searchParams.get('repository');

    let query = supabase
      .from('code_graphs')
      .select('*')
      .order('analyzed_at', { ascending: false });

    if (repository) {
      query = query.eq('repository', repository);
    }

    const { data, error } = await query.limit(10);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error fetching code graphs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch code graphs' },
      { status: 500 }
    );
  }
}