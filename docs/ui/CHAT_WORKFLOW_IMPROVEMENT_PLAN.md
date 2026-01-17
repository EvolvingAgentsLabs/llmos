# Plan de Mejora del Chat y Workflow de LLMOS

**Last Updated:** January 2026

## Vision General

Transformar el chat actual de LLMOS de una interacción lineal usuario-agente a un **sistema colaborativo multiagente con visualización de decisiones tipo Git**, inspirado en la forma en que los desarrolladores visualizan ramas y merges en VSCode.

---

## Problema Actual

1. **Verbosidad excesiva** - Los sistemas multiagente actuales son demasiado verbosos
2. **Interacción lenta** - La comunicación entre usuario y agentes/tareas es lenta
3. **Decisiones opacas** - El usuario no ve cómo se toman las decisiones
4. **Sin predicción** - No hay anticipación de hacia dónde va el flujo
5. **Sin votación** - Las decisiones son unilaterales del agente

---

## Arquitectura Propuesta

### 1. Chat Multiagente con Votación

```
┌─────────────────────────────────────────────────────────────┐
│                    CONVERSATION THREAD                       │
├─────────────────────────────────────────────────────────────┤
│  [User] ─────┬───────────────────────────────────────────── │
│              │                                               │
│  [Agent A] ──┼── Propone Solución A (vote: 👍 3)            │
│  [Agent B] ──┼── Propone Solución B (vote: 👍 1)            │
│  [Agent C] ──┴── Propone Solución C (vote: 👍 5) ✓ WINNER   │
│              │                                               │
│        ┌─────┴─────┐                                        │
│        │ VOTACIÓN  │  ⏱ 30s remaining                       │
│        │  A: 🔵🔵🔵 │  [Votar A] [Votar B] [Votar C]         │
│        │  B: 🔵    │  [Auto-decidir] [Extender tiempo]      │
│        │  C: 🔵🔵🔵🔵🔵│                                       │
│        └───────────┘                                        │
└─────────────────────────────────────────────────────────────┘
```

#### Interfaces TypeScript

```typescript
// lib/chat/multi-agent-chat.ts

interface ChatParticipant {
  id: string;
  type: 'user' | 'agent' | 'team-member';
  name: string;
  avatar?: string;
  role?: 'proposer' | 'voter' | 'observer';
}

interface ProposedSolution {
  id: string;
  proposerId: string;
  content: string;
  code?: string;
  confidence: number;  // 0-1
  reasoning: string;
  estimatedImpact: 'low' | 'medium' | 'high';
  votes: Vote[];
  predictedOutcome?: PredictedOutcome;
}

interface Vote {
  participantId: string;
  participantType: 'user' | 'agent';
  weight: number;  // Users might have higher weight
  timestamp: number;
  reason?: string;
}

interface VotingSession {
  id: string;
  questionId: string;
  solutions: ProposedSolution[];
  startTime: number;
  endTime: number;
  status: 'active' | 'completed' | 'expired' | 'cancelled';
  winner?: string;
  votingRules: VotingRules;
}

interface VotingRules {
  timeoutSeconds: number;
  minVotes: number;
  userVoteWeight: number;
  agentVoteWeight: number;
  autoDecideOnTimeout: boolean;
  requireUserVote: boolean;
}
```

---

### 2. Visualización Tipo Git Branches

Inspirado en cómo VSCode muestra el Git Graph, el flujo de decisiones se visualiza como ramas:

```
                    ┌─── [Opción A: Refactor] ───────── ❌ Descartada
                    │
[Pregunta] ─────────┼─── [Opción B: Fix directo] ─────── ✓ Seleccionada ─── [Continúa]
                    │                                         │
                    └─── [Opción C: Nueva impl.] ─── ?Explorando...
                                                              │
                                                              └── [Predicción: 72% éxito]
```

#### Componente React

```typescript
// components/chat/DecisionBranchView.tsx

interface DecisionNode {
  id: string;
  type: 'question' | 'option' | 'decision' | 'merge' | 'prediction';
  content: string;
  parentId?: string;
  children: string[];
  status: 'pending' | 'selected' | 'rejected' | 'exploring' | 'predicted';
  metadata: {
    votes?: number;
    confidence?: number;
    speculativeComputation?: SpeculativeResult;
    timeToDecision?: number;
  };
  position: { x: number; y: number };  // For rendering
}

interface DecisionBranch {
  id: string;
  nodes: DecisionNode[];
  edges: Edge[];
  currentHead: string;
  history: DecisionEvent[];
}

interface Edge {
  from: string;
  to: string;
  type: 'branch' | 'merge' | 'speculative';
  label?: string;
}

// Visualización similar a git graph
const DecisionBranchView: React.FC<{
  branch: DecisionBranch;
  onSelectOption: (nodeId: string) => void;
  onVote: (nodeId: string, vote: 'up' | 'down') => void;
  showPredictions: boolean;
}> = ({ branch, onSelectOption, onVote, showPredictions }) => {
  // Renderiza SVG con nodos y conexiones tipo git graph
  // - Líneas verticales para el flujo principal
  // - Ramificaciones horizontales para opciones
  // - Colores: verde (seleccionado), gris (descartado), azul (explorando)
  // - Líneas punteadas para predicciones
};
```

---

### 3. Sistema de Predicción de Flujos

Permite ver:
- **Historia**: Qué decisiones se tomaron antes
- **Presente**: Decisión actual en tiempo real
- **Futuro**: Predicción de probable evolución

```
┌─────────────────────────────────────────────────────────────┐
│  TIMELINE                                                    │
│  ══════════════════════════════════════════════════════════ │
│                                                              │
│  PASADO          │  PRESENTE        │  FUTURO (predicción)  │
│  ─────────       │  ─────────       │  ─────────────────    │
│                  │                  │                        │
│  ✓ Setup DB      │  🔄 Auth impl    │  → Tests (85%)         │
│  ✓ API routes    │     ├─ JWT       │  → Deploy (72%)        │
│  ✓ User model    │     └─ OAuth ←   │  → Docs (60%)          │
│                  │                  │                        │
│  [Ver detalle]   │  [Votar]         │  [Acelerar predicción] │
└─────────────────────────────────────────────────────────────┘
```

#### Interfaces

```typescript
// lib/prediction/flow-predictor.ts

interface FlowPrediction {
  nodeId: string;
  predictedPath: PredictedStep[];
  confidence: number;
  computationStarted?: boolean;
  partialResult?: any;
}

interface PredictedStep {
  description: string;
  probability: number;
  estimatedDuration?: string;
  dependencies: string[];
  speculativelyComputed: boolean;
}

interface TimelineView {
  past: CompletedDecision[];
  present: ActiveDecision;
  future: FlowPrediction[];
}

class FlowPredictor {
  // Analiza el contexto y predice próximos pasos
  async predictNextSteps(
    context: ConversationContext,
    currentDecision: ActiveDecision
  ): Promise<FlowPrediction[]>;

  // Basado en historial de decisiones similares
  async getHistoricalPatterns(
    taskType: string
  ): Promise<DecisionPattern[]>;

  // Calcula probabilidad de cada opción
  async calculateOptionProbabilities(
    options: ProposedSolution[],
    userHistory: UserPreference[]
  ): Promise<Map<string, number>>;
}
```

---

### 4. Computación Especulativa

Cuando hay alta probabilidad de que una opción sea elegida, se comienza a computar en background:

```typescript
// lib/speculative/speculative-executor.ts

interface SpeculativeExecution {
  id: string;
  optionId: string;
  probability: number;  // Solo ejecutar si > 70%
  status: 'queued' | 'computing' | 'completed' | 'cancelled';
  startTime: number;
  result?: SpeculativeResult;
  tokensUsed: number;
  cancelled: boolean;
}

interface SpeculativeResult {
  success: boolean;
  partialOutput: string;
  filesGenerated: string[];
  canContinue: boolean;  // Si la opción es confirmada, ¿se puede continuar?
  checkpointState: any;  // Estado para retomar si se confirma
}

class SpeculativeExecutor {
  private readonly PROBABILITY_THRESHOLD = 0.7;
  private readonly MAX_SPECULATIVE_TOKENS = 5000;

  async shouldExecuteSpeculatively(
    option: ProposedSolution,
    votingSession: VotingSession
  ): Promise<boolean> {
    // Calcular probabilidad basada en:
    // 1. Votos actuales
    // 2. Historial de preferencias del usuario
    // 3. Confianza del agente proponente
    const probability = await this.calculateWinProbability(option, votingSession);
    return probability >= this.PROBABILITY_THRESHOLD;
  }

  async executeSpeculatively(
    option: ProposedSolution,
    context: ConversationContext
  ): Promise<SpeculativeExecution> {
    // Ejecutar con límite de tokens
    // Guardar checkpoint para continuar si se confirma
    // Cancelar si otra opción gana
  }

  async confirmAndContinue(
    execution: SpeculativeExecution
  ): Promise<void> {
    // La opción fue confirmada - continuar desde checkpoint
    // Ahorrar tiempo porque ya está parcialmente computado
  }

  async cancel(executionId: string): Promise<void> {
    // Otra opción ganó - cancelar y liberar recursos
  }
}
```

---

### 5. Burbujas de Relaciones (Participation Bubbles)

Visualizar qué agentes y usuarios participan en cada tema/problema:

```
┌────────────────────────────────────────────┐
│  PROBLEMA: Implementar autenticación       │
│                                            │
│    ┌───────────────────────────────────┐   │
│    │          PARTICIPANTES            │   │
│    │                                   │   │
│    │   👤 Usuario ←────────────→ 🤖 A  │   │
│    │        ↕                    ↕     │   │
│    │   🤖 SecurityAgent ←──→ 🤖 B     │   │
│    │        ↕                          │   │
│    │   👥 Team (3 online)              │   │
│    │                                   │   │
│    └───────────────────────────────────┘   │
│                                            │
│  [Invitar agente] [Ver historial] [Focus]  │
└────────────────────────────────────────────┘
```

#### Interfaces

```typescript
// lib/collaboration/participation-bubble.ts

interface ParticipationBubble {
  id: string;
  topicId: string;
  topic: string;
  participants: BubbleParticipant[];
  relationships: ParticipantRelationship[];
  createdAt: number;
  lastActivity: number;
}

interface BubbleParticipant {
  id: string;
  type: 'user' | 'agent' | 'team';
  name: string;
  role: 'owner' | 'contributor' | 'observer';
  online: boolean;
  contributions: number;
  lastContribution: number;
}

interface ParticipantRelationship {
  from: string;
  to: string;
  type: 'collaborates' | 'reviews' | 'delegates' | 'supervises';
  strength: number;  // 0-1 based on interaction frequency
}
```

---

## Implementación por Fases

### Fase 1: Chat Multiagente Base (Semana 1-2)

**Archivos a crear/modificar:**

```
/lib/chat/
├── multi-agent-chat.ts          # Core del chat multiagente
├── voting-session.ts            # Sistema de votación
├── participant-manager.ts       # Gestión de participantes
└── solution-proposer.ts         # Propuesta de soluciones

components/chat/
├── MultiAgentChatPanel.tsx      # Nuevo panel de chat
├── VotingCard.tsx               # Card de votación
├── SolutionProposal.tsx         # Visualización de propuestas
└── ParticipantList.tsx          # Lista de participantes
```

**Tareas:**
1. Crear `MultiAgentChat` class que extiende funcionalidad actual
2. Implementar `VotingSession` con temporizador
3. Modificar `ChatPanel` para soportar múltiples agentes
4. Crear componentes de UI para votación
5. Integrar con `AgenticOrchestrator` existente

### Fase 2: Visualización Git Branches (Semana 3-4)

**Archivos a crear:**

```
lib/visualization/
├── decision-graph.ts            # Estructura de datos del grafo
├── graph-layout.ts              # Algoritmo de layout
└── decision-history.ts          # Historial de decisiones

components/visualization/
├── DecisionBranchView.tsx       # Componente principal
├── DecisionNode.tsx             # Nodo individual
├── BranchConnector.tsx          # Líneas de conexión
└── TimelineSlider.tsx           # Slider para navegar
```

**Tareas:**
1. Diseñar estructura de datos para grafo de decisiones
2. Implementar algoritmo de layout (similar a git-graph)
3. Crear componentes SVG para visualización
4. Integrar con historial de conversación existente
5. Añadir interactividad (zoom, pan, click-to-focus)

### Fase 3: Predicción de Flujos (Semana 5-6)

**Archivos a crear:**

```
lib/prediction/
├── flow-predictor.ts            # Motor de predicción
├── pattern-analyzer.ts          # Análisis de patrones
├── probability-calculator.ts    # Cálculo de probabilidades
└── historical-matcher.ts        # Match con historial

components/prediction/
├── FlowTimeline.tsx             # Timeline pasado-presente-futuro
├── PredictionBadge.tsx          # Badge de probabilidad
└── FuturePathPreview.tsx        # Preview de caminos futuros
```

**Tareas:**
1. Implementar `FlowPredictor` usando embeddings del LLM
2. Crear `PatternAnalyzer` que aprende de decisiones pasadas
3. Integrar con `PatternMatcher` existente
4. Diseñar UI para mostrar predicciones sin distraer
5. Añadir configuración de "agresividad" de predicción

### Fase 4: Computación Especulativa (Semana 7-8)

**Archivos a crear:**

```
lib/speculative/
├── speculative-executor.ts      # Ejecutor especulativo
├── checkpoint-manager.ts        # Gestión de checkpoints
├── resource-manager.ts          # Control de recursos/tokens
└── cancellation-handler.ts      # Manejo de cancelaciones

lib/workers/
├── speculative-worker.ts        # Web Worker para ejecución
└── checkpoint-serializer.ts     # Serialización de estado
```

**Tareas:**
1. Implementar `SpeculativeExecutor` con límites de tokens
2. Crear sistema de checkpoints para continuar ejecución
3. Usar Web Workers para ejecución en background
4. Implementar cancelación graceful
5. Añadir métricas de ahorro de tiempo

### Fase 5: Burbujas de Relaciones (Semana 9-10)

**Archivos a crear:**

```
lib/collaboration/
├── participation-bubble.ts      # Core de burbujas
├── relationship-tracker.ts      # Tracking de relaciones
└── topic-detector.ts            # Detección de temas

components/collaboration/
├── ParticipationBubble.tsx      # Visualización de burbuja
├── RelationshipGraph.tsx        # Grafo de relaciones
└── TopicSwitcher.tsx            # Cambiar entre temas
```

**Tareas:**
1. Implementar detección automática de temas
2. Crear tracking de participación por tema
3. Diseñar visualización de burbujas (force-directed graph)
4. Integrar con sistema de agentes existente
5. Añadir soporte para equipos (futuro multi-usuario)

---

## Arquitectura de Datos

### Nuevo Schema de Mensajes

```typescript
// Extender el schema actual de WorkflowEntry

interface EnhancedWorkflowEntry extends WorkflowEntry {
  // Campos existentes...

  // Nuevos campos para multiagente
  participantId?: string;
  participantType?: 'user' | 'agent' | 'team';

  // Campos para votación
  isProposal?: boolean;
  proposalId?: string;
  votingSessionId?: string;

  // Campos para branches
  branchId?: string;
  parentEntryId?: string;
  childEntryIds?: string[];

  // Campos para predicción
  isPredicted?: boolean;
  predictionConfidence?: number;
  actualOutcome?: string;

  // Campos para especulación
  isSpeculative?: boolean;
  speculativeExecutionId?: string;
  wasConfirmed?: boolean;
}
```

### Persistencia

```typescript
// Nuevas colecciones en VFS

interface ChatWorkflowStorage {
  // Sesiones de votación activas y completadas
  votingSessions: Map<string, VotingSession>;

  // Historial de decisiones (para el grafo)
  decisionHistory: DecisionNode[];

  // Predicciones y su accuracy
  predictionLog: PredictionResult[];

  // Ejecuciones especulativas
  speculativeExecutions: SpeculativeExecution[];

  // Burbujas de participación
  participationBubbles: Map<string, ParticipationBubble>;
}
```

---

## Integración con Arquitectura Existente

### Modificaciones al ChatPanel

```typescript
// Actualizar ChatPanel.tsx

const ChatPanel: React.FC = () => {
  // Estados existentes...

  // Nuevos estados
  const [viewMode, setViewMode] = useState<'linear' | 'branches' | 'timeline'>('linear');
  const [activeVotingSession, setActiveVotingSession] = useState<VotingSession | null>(null);
  const [participants, setParticipants] = useState<ChatParticipant[]>([]);
  const [predictions, setPredictions] = useState<FlowPrediction[]>([]);

  // Toggle entre vistas
  const renderChatView = () => {
    switch (viewMode) {
      case 'linear':
        return <LinearChatView messages={messages} />;
      case 'branches':
        return <DecisionBranchView branch={decisionBranch} />;
      case 'timeline':
        return <FlowTimeline timeline={timelineData} />;
    }
  };

  return (
    <div className="chat-panel">
      <ViewModeSelector mode={viewMode} onChange={setViewMode} />
      <ParticipantList participants={participants} />
      {renderChatView()}
      {activeVotingSession && (
        <VotingCard session={activeVotingSession} onVote={handleVote} />
      )}
      <ChatInput onSend={handleSend} />
    </div>
  );
};
```

### Modificaciones al Orchestrator

```typescript
// Actualizar system-agent-orchestrator.ts

class EnhancedSystemAgentOrchestrator extends SystemAgentOrchestrator {
  private votingManager: VotingSessionManager;
  private flowPredictor: FlowPredictor;
  private speculativeExecutor: SpeculativeExecutor;

  async executeWithMultiAgent(
    goal: string,
    context: ConversationContext
  ): Promise<SystemAgentResult> {
    // 1. Generar propuestas de múltiples agentes
    const proposals = await this.generateProposals(goal, context);

    // 2. Si hay múltiples opciones viables, iniciar votación
    if (proposals.length > 1 && this.shouldVote(proposals)) {
      const session = await this.votingManager.createSession(proposals);

      // 3. Mientras se vota, predecir y potencialmente especular
      const predictions = await this.flowPredictor.predictNextSteps(context, session);

      // 4. Si una opción tiene alta probabilidad, ejecutar especulativamente
      const topOption = this.getHighestProbabilityOption(proposals, predictions);
      if (topOption.probability > 0.7) {
        await this.speculativeExecutor.executeSpeculatively(topOption, context);
      }

      // 5. Esperar resultado de votación
      const winner = await session.waitForCompletion();

      // 6. Continuar con opción ganadora (potencialmente ya computada)
      return this.continueWithOption(winner, context);
    }

    // Flujo normal si solo hay una opción clara
    return super.execute(goal, context);
  }
}
```

---

## UI/UX Consideraciones

### Principios de Diseño

1. **No intrusivo**: El sistema de branches/votación es opt-in
2. **Progresivo**: Empezar con vista linear, mostrar branches cuando hay decisiones
3. **Rápido**: Las predicciones no deben bloquear la UI
4. **Informativo sin abrumar**: Mostrar confianza pero no todos los detalles

### Mockups de UI

```
┌──────────────────────────────────────────────────────────────────┐
│  LLMOS Chat                              [Linear] [Branches] [⏱] │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │ 👤 User: Implementar autenticación con JWT                   ││
│  └──────────────────────────────────────────────────────────────┘│
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │ 🤖 AuthAgent propone:                            [👍 2] [👎] ││
│  │ Usar passport.js con estrategia JWT...                       ││
│  │ Confianza: 85% | Impacto: Medio                              ││
│  └──────────────────────────────────────────────────────────────┘│
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │ 🤖 SecurityAgent propone:                        [👍 3] [👎] ││
│  │ Implementación custom con jose library...                    ││
│  │ Confianza: 78% | Impacto: Alto                    ⚡ +15% seg││
│  └──────────────────────────────────────────────────────────────┘│
│                                                                   │
│  ╔══════════════════════════════════════════════════════════════╗│
│  ║  VOTACIÓN ACTIVA                              ⏱ 45s restante ║│
│  ║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ║│
│  ║  Opción 1: ████████░░ 40%                                    ║│
│  ║  Opción 2: ████████████ 60%  ← Predicción: probablemente gana║│
│  ║                                                               ║│
│  ║  [Votar Opción 1]  [Votar Opción 2]  [Auto-decidir]          ║│
│  ╚══════════════════════════════════════════════════════════════╝│
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Escribe tu mensaje...                              [Enviar] │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Métricas de Éxito

1. **Tiempo de decisión**: Reducir tiempo entre propuesta y ejecución
2. **Ahorro por especulación**: % de tiempo ahorrado por computación especulativa
3. **Accuracy de predicciones**: % de predicciones correctas
4. **Engagement con votación**: Cuántas veces el usuario participa activamente
5. **Satisfacción**: Comparar con flujo linear tradicional

---

## Riesgos y Mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Gasto excesivo de tokens en especulación | Límite de 5000 tokens por especulación, solo si probabilidad > 70% |
| UI demasiado compleja | Vista linear por defecto, branches opt-in |
| Predicciones incorrectas confunden | Mostrar confidence, aprender de errores |
| Votación lentifica el flujo | Timeout corto (30-60s), auto-decide si no hay votos |
| Múltiples agentes = respuestas lentas | Ejecutar agentes en paralelo, streaming |

---

## Dependencias Técnicas

- **Visualización de grafos**: Usar D3.js o react-flow para branches
- **Web Workers**: Para ejecución especulativa sin bloquear UI
- **State Management**: Extender Zustand stores existentes
- **Animaciones**: Framer Motion para transiciones suaves
- **Persistencia**: Extender VFS para nuevos datos

---

## Próximos Pasos Inmediatos

1. [ ] Crear branch de desarrollo: `feature/multi-agent-chat`
2. [ ] Implementar `MultiAgentChat` class básica
3. [ ] Crear `VotingSession` con temporizador
4. [ ] Diseñar componente `VotingCard`
5. [ ] Integrar con `ChatPanel` existente (flag de feature)
6. [ ] Prueba de concepto de visualización de branches

---

## Referencias

- Git Graph en VSCode: Visualización de ramas y merges
- Copilot Chat: Interacción con agentes
- Cursor: Flujo de trabajo de desarrollo con AI
- GitHub Issues/PR: Sistema de votación y discusión
