import Anthropic from '@anthropic-ai/sdk'
import { SearchIntentAnalysis, SearchStrategy, DetectedEntity } from './types'

export class IntentAnalyzer {
  private anthropic: Anthropic
  
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || ''
    })
  }
  
  async analyze(query: string): Promise<SearchIntentAnalysis> {
    try {
      console.log('Analyzing query with Anthropic:', query)
      const prompt = `
Analyze this search query and extract:
1. Primary intent: find_code, find_memory, find_both, explore_topic, debug_issue, understand_implementation
2. Time frame: recent (last 24h), this_week, specific_period, historical, any
3. Code relevance: high (looking for code), medium (might involve code), low (unlikely code-related)
4. Pattern indicators: debugging, learning, problem_solving, documentation, none
5. Key entities: specific files, functions, errors, or concepts mentioned

Query: "${query}"

Examples:
- "How did I fix the auth bug?" → find_both, recent, high, [debugging], [auth, bug]
- "getUserProfile function" → find_code, any, high, [], [getUserProfile]
- "What was I working on yesterday?" → find_memory, recent, medium, [], [yesterday]
- "Show me all debugging sessions this week" → find_memory, this_week, medium, [debugging], []
- "vector search neo4j" → explore_topic, any, medium, [learning], [vector, search, neo4j]

Respond in JSON format with:
{
  "primary_intent": "...",
  "time_frame": "...",
  "code_relevance": "...",
  "pattern_indicators": ["..."],
  "key_entities": ["..."]
}
`
      
      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        messages: [{ role: 'user', content: prompt + '\n\nProvide your response as a valid JSON object.' }],
        max_tokens: 300,
        temperature: 0.3
      })
      
      // Extract JSON from the response
      const content = response.content[0].type === 'text' ? response.content[0].text : ''
      const analysis = JSON.parse(content)
      
      return {
        primaryIntent: analysis.primary_intent || 'find_both',
        timeframe: analysis.time_frame || 'any',
        codeRelevance: analysis.code_relevance || 'medium',
        patterns: analysis.pattern_indicators || [],
        entities: analysis.key_entities || [],
        strategies: this.determineStrategies(analysis)
      }
    } catch (error) {
      console.error('Intent analysis error:', error)
      // Fallback to basic keyword analysis
      return this.fallbackAnalysis(query)
    }
  }
  
  private determineStrategies(analysis: any): SearchStrategy[] {
    const strategies: SearchStrategy[] = []
    
    // Always include semantic search if we have embeddings
    strategies.push('semantic')
    
    // Add temporal if time-sensitive
    if (['recent', 'this_week', 'specific_period'].includes(analysis.time_frame)) {
      strategies.push('temporal')
    }
    
    // Add pattern search if patterns detected
    if (analysis.pattern_indicators && analysis.pattern_indicators.length > 0 && 
        analysis.pattern_indicators[0] !== 'none') {
      strategies.push('pattern')
    }
    
    // Add code search if code-relevant
    if (analysis.code_relevance === 'high' || analysis.primary_intent === 'find_code') {
      strategies.push('code_linked')
    }
    
    // Add keyword search as fallback
    strategies.push('keyword')
    
    return [...new Set(strategies)] // Remove duplicates
  }
  
  private fallbackAnalysis(query: string): SearchIntentAnalysis {
    const lowerQuery = query.toLowerCase()
    
    // Simple heuristics
    const hasCodeKeywords = /function|class|method|code|file|\.ts|\.js|\.tsx/.test(lowerQuery)
    const hasTimeKeywords = /yesterday|today|last week|recent|latest/.test(lowerQuery)
    const hasDebugKeywords = /debug|fix|bug|error|issue/.test(lowerQuery)
    const hasLearnKeywords = /learn|research|explore|understand/.test(lowerQuery)
    
    const strategies: SearchStrategy[] = ['semantic', 'keyword']
    if (hasTimeKeywords) strategies.push('temporal')
    if (hasDebugKeywords || hasLearnKeywords) strategies.push('pattern')
    if (hasCodeKeywords) strategies.push('code_linked')
    
    return {
      primaryIntent: hasCodeKeywords ? 'find_code' : 'find_memory',
      timeframe: hasTimeKeywords ? 'recent' : 'any',
      codeRelevance: hasCodeKeywords ? 'high' : 'low',
      patterns: hasDebugKeywords ? ['debugging'] : hasLearnKeywords ? ['learning'] : [],
      entities: query.split(/\s+/).filter(word => word.length > 3),
      strategies
    }
  }
  
  // Extract entities from the query for better search
  extractEntities(query: string): DetectedEntity[] {
    const entities: DetectedEntity[] = []
    const lowerQuery = query.toLowerCase()
    
    // Function/class patterns
    const functionPattern = /(?:function|method|class)\s+(\w+)/gi
    let match
    while ((match = functionPattern.exec(query)) !== null) {
      entities.push({
        text: match[1],
        type: 'function',
        confidence: 0.9
      })
    }
    
    // File patterns
    const filePattern = /([a-zA-Z0-9_-]+\.(ts|js|tsx|jsx|py|go|java))/gi
    functionPattern.lastIndex = 0
    while ((match = filePattern.exec(query)) !== null) {
      entities.push({
        text: match[1],
        type: 'file',
        confidence: 0.95
      })
    }
    
    // Error patterns
    if (lowerQuery.includes('error') || lowerQuery.includes('bug')) {
      entities.push({
        text: 'error',
        type: 'error',
        confidence: 0.8
      })
    }
    
    return entities
  }
}