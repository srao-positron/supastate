import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const LinkMemoriesSchema = z.object({
  projectName: z.string().optional(),
  memoryId: z.string().uuid().optional(),
  threshold: z.number().min(0).max(1).default(0.7),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const body = await request.json()
    const { projectName, memoryId, threshold } = LinkMemoriesSchema.parse(body)
    
    if (!projectName && !memoryId) {
      return NextResponse.json({ 
        error: 'Either projectName or memoryId is required' 
      }, { status: 400 })
    }
    
    // Verify access to the project or memory
    if (projectName) {
      // Check if user has access to this project through team membership
      const { data: access } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', user.id)
        .single()
      
      if (!access) {
        // Check if it's a personal project
        const workspaceId = `user:${user.id}`
        // For now, we'll allow access - in production, verify project belongs to user
      }
    }
    
    // Call the edge function
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/link-memory-code`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          memoryId,
          projectName,
          workspaceId: projectName ? undefined : `user:${user.id}`,
          threshold,
        }),
      }
    )
    
    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Edge function error: ${error}`)
    }
    
    const result = await response.json()
    
    return NextResponse.json({
      success: true,
      ...result
    })
    
  } catch (error) {
    console.error('Error linking memories to code:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({ 
        error: 'Invalid request data',
        details: error.errors
      }, { status: 400 })
    }
    
    return NextResponse.json({ 
      error: 'Failed to link memories to code',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}