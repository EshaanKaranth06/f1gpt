# Graph Report - .  (2026-05-03)

## Corpus Check
- Corpus is ~10,429 words - fits in a single context window. You may not need a graph.

## Summary
- 133 nodes · 142 edges · 25 communities detected
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Streaming Chat Config|Streaming Chat Config]]
- [[_COMMUNITY_Client Chat Interface|Client Chat Interface]]
- [[_COMMUNITY_Server RAG Pipeline|Server RAG Pipeline]]
- [[_COMMUNITY_Astra Ingestion Flow|Astra Ingestion Flow]]
- [[_COMMUNITY_LoadDB Helpers|LoadDB Helpers]]
- [[_COMMUNITY_Next Starter Docs|Next Starter Docs]]
- [[_COMMUNITY_Racing Background Asset|Racing Background Asset]]
- [[_COMMUNITY_Home Page Handlers|Home Page Handlers]]
- [[_COMMUNITY_Embedding Cache Flow|Embedding Cache Flow]]
- [[_COMMUNITY_F1GPT Logo Asset|F1GPT Logo Asset]]
- [[_COMMUNITY_Formula 1 Logo Asset|Formula 1 Logo Asset]]
- [[_COMMUNITY_Chat Route Functions|Chat Route Functions]]
- [[_COMMUNITY_ESLint Next Rules|ESLint Next Rules]]
- [[_COMMUNITY_Root Layout File|Root Layout File]]
- [[_COMMUNITY_Bubble Formatting|Bubble Formatting]]
- [[_COMMUNITY_Loading Bubble|Loading Bubble]]
- [[_COMMUNITY_Prompt Button|Prompt Button]]
- [[_COMMUNITY_Prompt Row|Prompt Row]]
- [[_COMMUNITY_Custom Chat Hook|Custom Chat Hook]]
- [[_COMMUNITY_ESLint File|ESLint File]]
- [[_COMMUNITY_Next Env Types|Next Env Types]]
- [[_COMMUNITY_Next Config File|Next Config File]]
- [[_COMMUNITY_AI SDK Types|AI SDK Types]]
- [[_COMMUNITY_AI Stream Types|AI Stream Types]]
- [[_COMMUNITY_Asset Module Types|Asset Module Types]]

## God Nodes (most connected - your core abstractions)
1. `POST Chat Endpoint` - 12 edges
2. `loadData` - 10 edges
3. `Home Chat Page` - 7 edges
4. `Home handleSubmit` - 7 edges
5. `Formula Racing Track Scene` - 7 edges
6. `Next.js Project` - 5 edges
7. `SSE Stream Forwarding` - 5 edges
8. `embedBatch()` - 4 edges
9. `loadData()` - 4 edges
10. `NextConfig Runtime Configuration` - 4 edges

## Surprising Connections (you probably didn't know these)
- `Next.js Type References` --references--> `Next.js Project`  [EXTRACTED]
  next-env.d.ts → README.md
- `API Streaming Headers` --conceptually_related_to--> `SSE Stream Forwarding`  [INFERRED]
  next.config.ts → app/api/chat/route.ts
- `embedBatch` --calls--> `normalize()`  [EXTRACTED]
  scripts/loadDB.ts → scripts\loadDB.ts
- `POST Chat Endpoint` --shares_data_with--> `ai Message`  [EXTRACTED]
  app/api/chat/route.ts → types/ai.d.ts
- `embedBatch` --conceptually_related_to--> `getEmbedding`  [INFERRED]
  scripts/loadDB.ts → app/api/chat/route.ts

## Hyperedges (group relationships)
- **Client Chat UI Flow** — page_home_component, page_chat_state, page_handle_submit, bubble_bubble_component, loadingbubble_loading_bubble, prompt_suggestion_row_component [EXTRACTED 1.00]
- **Server RAG Answer Flow** — route_post_chat_endpoint, route_get_embedding, route_astra_vector_retrieval, route_gemini_rerank_api, route_f1gpt_system_prompt, route_gemini_stream_api, route_sse_stream_forwarding [EXTRACTED 1.00]
- **Ingestion to Retrieval RAG Corpus** — loaddb_load_data, loaddb_document_schema, loaddb_astra_collection_f1_gpt, route_astra_collection_f1_gpt, route_astra_vector_retrieval [EXTRACTED 1.00]
- **Formula Racing Visual Composition** — background_formula_style_race_car, background_wet_race_track, background_sunset_lighting, background_pit_lane_structure, background_track_safety_fence, background_motion_blur_speed_atmosphere [EXTRACTED 1.00]
- **F1 GPT Logo Lockup** — img_stylized_white_f_mark, img_f1_gpt_wordmark, img_red_grid_background [EXTRACTED 1.00]
- **F1 Logo Visual Composition** — img2_f1_logo_image, img2_stylized_f1_wordmark, img2_trademark_symbol, img2_red_white_palette [EXTRACTED 1.00]

## Communities

### Community 0 - "Streaming Chat Config"
Cohesion: 0.14
Nodes (17): @ai-sdk/react Message, @ai-sdk/react useChat Contract, API Streaming Headers, ESLint Build Bypass, NextConfig Runtime Configuration, Server Actions 2MB Body Limit, Webpack topLevelAwait and Layers, Request Abort Timeout (+9 more)

### Community 1 - "Client Chat Interface"
Cohesion: 0.13
Nodes (16): Bubble Component, Formatted Content State, Bubble Message Interface, PNG Module Declaration, WebP Module Declaration, F1GPT Metadata, RootLayout, LoadingBubble Component (+8 more)

### Community 2 - "Server RAG Pipeline"
Cohesion: 0.16
Nodes (15): ai Message, ai streamText Contract, Astra Document Schema, F1 Data Source List, Source Weighting Scheme, Astra Vector Retrieval, Candidate Documents, Conversational Query Bypass (+7 more)

### Community 3 - "Astra Ingestion Flow"
Cohesion: 0.18
Nodes (12): Astra DB f1_gpt Collection Ingestion Side, cleanText, createCollection, loadDB Entry Point, hashText, Astra insertMany Documents, isAlreadyLoaded, isJunkChunk (+4 more)

### Community 4 - "LoadDB Helpers"
Cohesion: 0.29
Nodes (7): cleanText(), delay(), embedBatch(), isAlreadyLoaded(), loadData(), normalize(), scrapePage()

### Community 5 - "Next Starter Docs"
Cohesion: 0.25
Nodes (8): Next Image Type References, Next.js Type References, create-next-app, Geist Font, next/font, Next.js API Routes, Next.js Project, Vercel Platform

### Community 6 - "Racing Background Asset"
Cohesion: 0.36
Nodes (8): Background Image Asset, Formula Racing Track Scene, Formula-Style Race Car, Motion Blur Speed Atmosphere, Pit Lane Structure, Sunset Lighting, Track Safety Fence, Wet Race Track

### Community 7 - "Home Page Handlers"
Cohesion: 0.47
Nodes (3): createMessage(), handlePrompt(), handleSubmit()

### Community 8 - "Embedding Cache Flow"
Cohesion: 0.4
Nodes (5): Gemini batchEmbedContents API, embedBatch, Query Embedding Cache, getEmbedding, GoogleGenerativeAIEmbeddings.embedQuery

### Community 9 - "F1GPT Logo Asset"
Cohesion: 0.6
Nodes (5): F1 GPT Logo, F1 GPT Wordmark, Motorsport AI Branding, Red Grid Background, Stylized White F Mark

### Community 10 - "Formula 1 Logo Asset"
Cohesion: 0.5
Nodes (5): F1 Logo Image, Formula 1 Brand, Red and White Color Palette, Stylized F1 Wordmark, Trademark Symbol

### Community 11 - "Chat Route Functions"
Cohesion: 0.83
Nodes (3): formatUTCDateTime(), getEmbedding(), POST()

### Community 12 - "ESLint Next Rules"
Cohesion: 0.67
Nodes (3): FlatCompat ESLint Config, Next TypeScript ESLint Rules, Next Core Web Vitals ESLint Rules

### Community 13 - "Root Layout File"
Cohesion: 1.0
Nodes (0): 

### Community 14 - "Bubble Formatting"
Cohesion: 1.0
Nodes (0): 

### Community 15 - "Loading Bubble"
Cohesion: 1.0
Nodes (0): 

### Community 16 - "Prompt Button"
Cohesion: 1.0
Nodes (0): 

### Community 17 - "Prompt Row"
Cohesion: 1.0
Nodes (0): 

### Community 18 - "Custom Chat Hook"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "ESLint File"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "Next Env Types"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Next Config File"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "AI SDK Types"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "AI Stream Types"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Asset Module Types"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **37 isolated node(s):** `create-next-app`, `Next.js API Routes`, `Geist Font`, `Vercel Platform`, `Next Core Web Vitals ESLint Rules` (+32 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Root Layout File`** (2 nodes): `layout.tsx`, `RootLayout()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Bubble Formatting`** (2 nodes): `Bubble.tsx`, `formatTime()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Loading Bubble`** (2 nodes): `LoadingBubble.tsx`, `LoadingBubble()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Prompt Button`** (2 nodes): `PromptSuggestionButton.tsx`, `PromptSuggestionButton()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Prompt Row`** (2 nodes): `PromptSuggestionRow.tsx`, `PromptSuggestionRow()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Custom Chat Hook`** (2 nodes): `useCustomChats.ts`, `useCustomChat()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `ESLint File`** (1 nodes): `eslint.config.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Next Env Types`** (1 nodes): `next-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Next Config File`** (1 nodes): `next.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `AI SDK Types`** (1 nodes): `ai-sdk-react.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `AI Stream Types`** (1 nodes): `ai.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Asset Module Types`** (1 nodes): `custom.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `POST Chat Endpoint` connect `Server RAG Pipeline` to `Embedding Cache Flow`, `Streaming Chat Config`?**
  _High betweenness centrality (0.203) - this node is a cross-community bridge._
- **Why does `Home handleSubmit` connect `Streaming Chat Config` to `Client Chat Interface`, `Server RAG Pipeline`?**
  _High betweenness centrality (0.128) - this node is a cross-community bridge._
- **Why does `embedBatch` connect `Embedding Cache Flow` to `Astra Ingestion Flow`, `LoadDB Helpers`?**
  _High betweenness centrality (0.106) - this node is a cross-community bridge._
- **What connects `create-next-app`, `Next.js API Routes`, `Geist Font` to the rest of the system?**
  _37 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Streaming Chat Config` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._
- **Should `Client Chat Interface` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._