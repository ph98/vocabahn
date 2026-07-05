# Model Context Protocol (MCP) Integration

As an AI-first learning platform, Vocabahn is designed to be accessible not just to human users through the web UI, but also to AI assistants through the **Model Context Protocol (MCP)**.

MCP allows external, local, or cloud-based AI agents to securely query and interact with a user's Vocabahn data.

## 1. Vision & Goal
The goal is to provide users with an environment where their AI assistant (e.g., Claude Desktop, Cursor, or custom chatbots) can:
- **Query** their current vocabulary knowledge (e.g., "What words did I struggle with today?").
- **Look up** words in the Vocabahn shared dictionary.
- **Enrich** or suggest new flashcards based on external texts the user is reading.

## 2. Proposed MCP Server Architecture
*Note: This is the architectural roadmap for the MCP implementation.*

We plan to expose a standalone MCP Server (e.g., in `apps/mcp-server`) that interfaces with the core NestJS backend.

### Standardized Tools
The MCP server will expose the following tools to AI clients:
- `vocabahn_lookup_word(word: string)`: Returns the AI-enriched dictionary definition and translations.
- `vocabahn_add_flashcard(word: string)`: Adds a specific word to the user's learning queue.
- `vocabahn_get_stats()`: Returns the user's daily study streak, items reviewed, and knowledge estimation.

### Standardized Resources
- `vocabahn://user/deck/active`: A live view of the user's active review list.
- `vocabahn://system/dictionary/recent`: A feed of newly enriched words added by the community.

## 3. Security and Authentication
Since MCP servers run locally but access remote data, the server will require a Personal Access Token (PAT) generated from the Vocabahn Web UI. All requests made by the MCP server on behalf of the AI assistant will be scoped and rate-limited.
