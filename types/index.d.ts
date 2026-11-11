export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'csb': {
      pose: 'wake' | 'idle' | 'think' | 'read' | 'type' | 'lift' | 'ask' | 'write' | 'compact' | 'done' | 'stop' | 'error' | 'cold' | 'sleep'
      limits: Limit[]
      ctx: number | null
    }
  }
}
