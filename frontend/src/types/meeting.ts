/**
 * Boardroom AI — TypeScript Type Definitions
 * =============================================
 * Shared interfaces and types for the frontend application.
 * Mirrors the backend API schemas for type safety.
 */

// ---------------------------------------------------------------------------
// Template Types
// ---------------------------------------------------------------------------

/** Supported board meeting template types */
export type TemplateType =
  | "STARTUP_BOARD"
  | "HIRING_BOARD"
  | "FREELANCER_BOARD"
  | "STUDENT_BOARD"
  | "PRODUCT_BOARD";

/** Field definition for dynamic form rendering */
export interface FieldDefinition {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "number";
  required: boolean;
  placeholder?: string;
  options?: string[];
}

/** Display metadata for a board template */
export interface TemplateMetadata {
  name: string;
  description: string;
  icon: string;
  accentColor: string;
  exampleDecision: string;
  fields: FieldDefinition[];
}

// ---------------------------------------------------------------------------
// Meeting Input / Output
// ---------------------------------------------------------------------------

/** Input payload for POST /meeting */
export interface MeetingInput {
  template: TemplateType;
  fields: Record<string, string | number>;
}

/** A single board member's vote */
export interface BoardVote {
  vote: "YES" | "NO" | "DEFER";
  confidence: number;
}

/** Full meeting report returned by the backend */
export interface MeetingReport {
  meeting_id: string;
  template: string;
  decision_title: string;
  final_decision: "APPROVE" | "REJECT" | "DEFER";
  confidence_score: number;
  board_votes: {
    CEO: BoardVote;
    CFO: BoardVote;
    CTO: BoardVote;
    CMO: BoardVote;
    Risk: BoardVote;
    Devil: BoardVote;
  };
  agent_analyses: {
    CEO: string;
    CFO: string;
    CTO: string;
    CMO: string;
    Risk: string;
    Devil: string;
  };
  key_risks: string[];
  recommended_actions: string[];
  debate_summary: string;
  timeline_suggestions: string[];
}

// ---------------------------------------------------------------------------
// Agent Display Info
// ---------------------------------------------------------------------------

/** Agent roles for display purposes */
export type AgentRole = "PlannerAgent" | "CEO" | "CFO" | "CTO" | "CMO" | "Risk" | "Devil" | "ModeratorAgent";

/** Display info for each agent */
export interface AgentInfo {
  role: string;
  title: string;
  icon: string;
  color: string;
}

/** Static agent display data */
export const AGENT_INFO: Record<string, AgentInfo> = {
  PlannerAgent: {
    role: "Planner",
    title: "Meeting Planner",
    icon: "📋",
    color: "from-slate-100 to-slate-200",
  },
  CEO: {
    role: "CEO",
    title: "Chief Executive Officer",
    icon: "👔",
    color: "from-blue-500 to-blue-700",
  },
  CFO: {
    role: "CFO",
    title: "Chief Financial Officer",
    icon: "💰",
    color: "from-emerald-500 to-emerald-700",
  },
  CTO: {
    role: "CTO",
    title: "Chief Technology Officer",
    icon: "⚙️",
    color: "from-blue-500 to-blue-700",
  },
  CMO: {
    role: "CMO",
    title: "Chief Marketing Officer",
    icon: "📢",
    color: "from-orange-500 to-orange-700",
  },
  Risk: {
    role: "Risk",
    title: "Chief Risk Officer",
    icon: "🛡️",
    color: "from-red-500 to-red-700",
  },
  Devil: {
    role: "Devil",
    title: "Devil's Advocate",
    icon: "😈",
    color: "from-rose-500 to-rose-700",
  },
  ModeratorAgent: {
    role: "Moderator",
    title: "Board Moderator",
    icon: "⚖️",
    color: "from-blue-500 to-blue-700",
  },
};


// ---------------------------------------------------------------------------
// Template Definitions (mirrors backend)
// ---------------------------------------------------------------------------

export const TEMPLATES: Record<TemplateType, TemplateMetadata> = {
  STARTUP_BOARD: {
    name: "Startup Board",
    description: "For founders making company-level strategic decisions",
    icon: "🚀",
    accentColor: "blue",
    exampleDecision: "Should we pivot from B2C to B2B SaaS?",
    fields: [
      { key: "company_name", label: "Company Name", type: "text", required: true, placeholder: "e.g. Acme Inc." },
      { key: "decision_title", label: "Decision Title", type: "text", required: true, placeholder: "e.g. Should we pivot to B2B?" },
      { key: "decision_goal", label: "Decision Goal", type: "textarea", required: true, placeholder: "What are you trying to achieve?" },
      { key: "company_stage", label: "Company Stage", type: "select", required: true, options: ["idea", "pre-revenue", "seed", "series-a", "growth"] },
      { key: "funding_status", label: "Funding Status", type: "text", required: false, placeholder: "e.g. Bootstrapped, $500K raised" },
      { key: "team_size", label: "Team Size", type: "number", required: false, placeholder: "e.g. 5" },
      { key: "monthly_revenue", label: "Monthly Revenue ($)", type: "text", required: false, placeholder: "e.g. $10,000" },
      { key: "runway_months", label: "Runway (Months)", type: "number", required: false, placeholder: "e.g. 18" },
      { key: "industry", label: "Industry", type: "text", required: false, placeholder: "e.g. SaaS, FinTech" },
      { key: "deadline", label: "Decision Deadline", type: "text", required: false, placeholder: "e.g. End of Q3 2026" },
    ],
  },
  HIRING_BOARD: {
    name: "Hiring Board",
    description: "For hiring, firing, or promotion decisions",
    icon: "👥",
    accentColor: "emerald",
    exampleDecision: "Should we hire a VP of Engineering now?",
    fields: [
      { key: "company_name", label: "Company Name", type: "text", required: true, placeholder: "e.g. Acme Inc." },
      { key: "decision_title", label: "Decision Title", type: "text", required: true, placeholder: "e.g. Should we hire a VP of Engineering?" },
      { key: "role_title", label: "Role Title", type: "text", required: true, placeholder: "e.g. Senior Backend Engineer" },
      { key: "salary_budget", label: "Salary Budget", type: "text", required: false, placeholder: "e.g. $120,000 - $150,000" },
      { key: "team_size", label: "Current Team Size", type: "number", required: false, placeholder: "e.g. 8" },
      { key: "urgency", label: "Urgency Level", type: "select", required: true, options: ["low", "medium", "high", "critical"] },
      { key: "current_team_workload", label: "Current Team Workload", type: "textarea", required: false, placeholder: "Describe team capacity" },
      { key: "industry", label: "Industry", type: "text", required: false, placeholder: "e.g. SaaS, E-commerce" },
      { key: "decision_goal", label: "Decision Goal", type: "textarea", required: true, placeholder: "What outcome are you hoping for?" },
      { key: "deadline", label: "Decision Deadline", type: "text", required: false, placeholder: "e.g. Within 2 weeks" },
    ],
  },
  FREELANCER_BOARD: {
    name: "Freelancer Board",
    description: "For independent workers and solopreneurs",
    icon: "💼",
    accentColor: "amber",
    exampleDecision: "Should I take this $15K project from a new client?",
    fields: [
      { key: "your_name", label: "Your Name", type: "text", required: true, placeholder: "e.g. Jane Doe" },
      { key: "decision_title", label: "Decision Title", type: "text", required: true, placeholder: "e.g. Should I take this project?" },
      { key: "project_type", label: "Project Type", type: "text", required: true, placeholder: "e.g. Web development" },
      { key: "budget_offered", label: "Budget Offered", type: "text", required: false, placeholder: "e.g. $15,000" },
      { key: "project_timeline", label: "Project Timeline", type: "text", required: false, placeholder: "e.g. 3 months" },
      { key: "current_capacity_percent", label: "Current Capacity (%)", type: "number", required: false, placeholder: "e.g. 70" },
      { key: "client_history", label: "Client Relationship", type: "select", required: false, options: ["new", "returning", "referral"] },
      { key: "decision_goal", label: "Decision Goal", type: "textarea", required: true, placeholder: "What are you trying to decide?" },
      { key: "deadline", label: "Decision Deadline", type: "text", required: false, placeholder: "e.g. Must respond by Friday" },
    ],
  },
  STUDENT_BOARD: {
    name: "Student Board",
    description: "For academic and career decisions",
    icon: "🎓",
    accentColor: "sky",
    exampleDecision: "Should I pursue a Master's or start working?",
    fields: [
      { key: "your_name", label: "Your Name", type: "text", required: true, placeholder: "e.g. Alex Chen" },
      { key: "decision_title", label: "Decision Title", type: "text", required: true, placeholder: "e.g. Master's vs working?" },
      { key: "options_being_compared", label: "Options Being Compared", type: "textarea", required: true, placeholder: "List the options" },
      { key: "current_situation", label: "Current Situation", type: "textarea", required: true, placeholder: "Describe your situation" },
      { key: "long_term_goals", label: "Long-Term Goals", type: "textarea", required: false, placeholder: "Where do you see yourself in 5-10 years?" },
      { key: "key_constraints", label: "Key Constraints", type: "textarea", required: false, placeholder: "e.g. Financial, location" },
      { key: "decision_goal", label: "Decision Goal", type: "textarea", required: true, placeholder: "What outcome would make this a success?" },
      { key: "deadline", label: "Decision Deadline", type: "text", required: false, placeholder: "e.g. Application deadline in 2 months" },
    ],
  },
  PRODUCT_BOARD: {
    name: "Product Board",
    description: "For product and feature decisions",
    icon: "📦",
    accentColor: "rose",
    exampleDecision: "Should we build real-time collaboration features?",
    fields: [
      { key: "product_name", label: "Product Name", type: "text", required: true, placeholder: "e.g. TaskFlow App" },
      { key: "decision_title", label: "Decision Title", type: "text", required: true, placeholder: "e.g. Build real-time collab?" },
      { key: "feature_description", label: "Feature Description", type: "textarea", required: true, placeholder: "Describe the feature in detail" },
      { key: "target_users", label: "Target Users", type: "text", required: false, placeholder: "e.g. Enterprise teams" },
      { key: "estimated_engineering_effort", label: "Estimated Engineering Effort", type: "text", required: false, placeholder: "e.g. 3 engineers, 6 weeks" },
      { key: "potential_revenue_impact", label: "Potential Revenue Impact", type: "text", required: false, placeholder: "e.g. 20% ARR increase" },
      { key: "strategic_alignment", label: "Strategic Alignment", type: "textarea", required: false, placeholder: "How does this align with vision?" },
      { key: "decision_goal", label: "Decision Goal", type: "textarea", required: true, placeholder: "What should this accomplish?" },
      { key: "deadline", label: "Decision Deadline", type: "text", required: false, placeholder: "e.g. Sprint planning Monday" },
    ],
  },
};
