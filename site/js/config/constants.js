// Keep the legacy key so existing local progress survives the EconFlow rename.
export const STORAGE_KEY = "uplearn-econ-progress-v3";
export const DAY_MS = 24 * 60 * 60 * 1000;
export const FIREBASE_SDK_VERSION = "12.12.1";
export const CLOUD_PROGRESS_DOC_ID = "default";

export const PAPER_GUIDANCE = {
  "Paper 1": "Microeconomics focus: chains of reasoning, diagrams, and market failure evaluation.",
  "Paper 2": "Macroeconomics focus: AD/AS logic, policy trade-offs, and real-world performance data.",
  "Paper 3": "Synoptic focus: connect micro and macro ideas, compare options, and sustain evaluation.",
};

export const SPEC_BLUEPRINT = {
  "14": {
    theme: "Theme 1: Introduction to Markets and Market Failure",
    papers: ["Paper 1", "Paper 3"],
    official: ["Nature of economics", "How markets work", "Market failure", "Government intervention"],
    revision: ["Nature of Economics", "How Markets Work", "Market Failure", "Government Intervention"],
  },
  "15": {
    theme: "Theme 2: The UK Economy - Performance and Policies",
    papers: ["Paper 2", "Paper 3"],
    official: ["Measures of economic performance", "Aggregate demand", "Aggregate supply", "National income", "Economic growth", "Macroeconomic objectives and policy"],
    revision: ["Measures of Economic Performance", "Aggregate Demand", "Aggregate Supply", "National Income", "Economic Growth", "Macroeconomic Objectives and Policies"],
  },
  "16": {
    theme: "Theme 3: Business Behaviour and the Labour Market",
    papers: ["Paper 1", "Paper 3"],
    official: ["Business growth", "Business objectives", "Revenues, costs and profits", "Market structures", "Labour market", "Government intervention"],
    revision: ["Business Growth", "Business Objectives", "Revenues, Costs & Profits", "Market Structures", "Labour Market", "Government Intervention"],
  },
  "17": {
    theme: "Theme 4: A Global Perspective",
    papers: ["Paper 2", "Paper 3"],
    official: ["International economics", "Poverty and inequality", "Emerging and developing economies", "The financial sector", "Role of the state in the macroeconomy"],
    revision: ["International Economics", "Poverty & Inequality", "Emerging & Developing Economies", "The Financial Sector", "Role of the State in the Macroeconomy"],
  },
};
