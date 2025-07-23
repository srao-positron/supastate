import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchGraphEntities, getEntityRelationships } from '@/lib/api/graph';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const entityId = searchParams.get('entityId');

    if (entityId) {
      // Get relationships for a specific entity
      const relationships = await getEntityRelationships(entityId);
      return NextResponse.json({
        success: true,
        data: { relationships },
      });
    }

    if (query) {
      // Search for entities
      const entities = await searchGraphEntities(query);
      return NextResponse.json({
        success: true,
        data: { entities },
      });
    }

    return NextResponse.json({
      error: 'Please provide either a query (q) or entityId parameter',
    }, { status: 400 });
  } catch (error) {
    console.error('Error querying graph:', error);
    return NextResponse.json(
      { error: 'Failed to query graph' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { query, filters = {} } = body;

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    // Perform vector search on memories with code entity type
    const { data: memories, error } = await supabase
      .from('memories')
      .select('*')
      .eq('type', 'code_entity')
      .textSearch('content', query)
      .limit(20);

    if (error) {
      throw error;
    }

    // Transform memories to graph nodes
    const entities = memories.map(memory => ({
      id: memory.metadata?.nodeId || memory.id,
      name: memory.title,
      type: memory.metadata?.entityType || 'function',
      filePath: memory.metadata?.filePath || 'unknown',
      lineNumber: memory.metadata?.lineNumber || 1,
      description: memory.content,
    }));

    return NextResponse.json({
      success: true,
      data: {
        entities,
        totalCount: entities.length,
        query,
      },
    });
  } catch (error) {
    console.error('Error performing graph search:', error);
    return NextResponse.json(
      { error: 'Failed to perform graph search' },
      { status: 500 }
    );
  }
}