/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type { CompatibleTool } from './types'

export const COMPATIBLE_TOOLS: CompatibleTool[] = [
  {
    id: 'cursor',
    name: 'Cursor',
    category: 'IDE',
    tagline: 'AI code editor',
    configTip: 'Settings > Models > OpenAI API Key & Base URL',
    website: 'https://cursor.com',
  },
  {
    id: 'cherry-studio',
    name: 'Cherry Studio',
    category: 'Desktop',
    tagline: 'Cross-platform desktop AI client',
    configTip: 'Settings > Custom Provider > Enter API Domain & Key',
    website: 'https://cherry-ai.com',
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    category: 'CLI',
    tagline: 'Autonomous terminal coding agent',
    configTip: 'Set environment variable ANTHROPIC_BASE_URL to seamlessly take over',
    website: 'https://claude.ai/code',
  },
  {
    id: 'cline',
    name: 'Cline / Roo Code',
    category: 'VSCode',
    tagline: 'Autonomous AI coding assistant',
    configTip: 'Select OpenAI Compatible as API Provider and enter key',
    website: 'https://github.com/cline/cline',
  },
  {
    id: 'nextchat',
    name: 'NextChat',
    category: 'Web',
    tagline: 'Lightweight cross-platform Web UI',
    configTip: 'Settings > Custom Interface > Enter Base URL & Key',
    website: 'https://nextchat.dev',
  },
  {
    id: 'dify',
    name: 'Dify / FastGPT',
    category: 'Workflow',
    tagline: 'Enterprise LLM application development',
    configTip: 'Model Provider > Add OpenAI-API-compatible configuration',
    website: 'https://dify.ai',
  },
]
