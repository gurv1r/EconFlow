const MODULE_SPEC_META = {
  "14": {
    themeCode: "Theme 1",
    specRange: "1.1-1.4",
    themeTitle: "Introduction to Markets and Market Failure",
  },
  "15": {
    themeCode: "Theme 2",
    specRange: "2.1-2.6",
    themeTitle: "The UK Economy - Performance and Policies",
  },
  "16": {
    themeCode: "Theme 3",
    specRange: "3.1-3.6",
    themeTitle: "Business Behaviour and the Labour Market",
  },
  "17": {
    themeCode: "Theme 4",
    specRange: "4.1-4.5",
    themeTitle: "A Global Perspective",
  },
};

const SPEC_SECTION_TITLES = {
  "1.1": "Nature of economics",
  "1.2": "How markets work",
  "1.3": "Market failure",
  "1.4": "Government intervention",
  "2.1": "Measures of economic performance",
  "2.2": "Aggregate demand",
  "2.3": "Aggregate supply",
  "2.4": "National income",
  "2.5": "Economic growth",
  "2.6": "Macroeconomic objectives and policies",
  "3.1": "Business growth",
  "3.2": "Business objectives",
  "3.3": "Revenues, costs and profits",
  "3.4": "Market structures",
  "3.5": "Labour market",
  "3.6": "Government intervention",
  "4.1": "International economics",
  "4.2": "Poverty and inequality",
  "4.3": "Emerging and developing economies",
  "4.4": "The financial sector",
  "4.5": "Role of the state in the macroeconomy",
};

const TOPIC_SPEC_ENTRIES = [
  ["14", "Nature of Economics", "Economics as a Social Science", ["1.1.1"]],
  ["14", "Nature of Economics", "Positive & Normative", ["1.1.2"]],
  ["14", "Nature of Economics", "The Economic Problem", ["1.1.3"]],
  ["14", "Nature of Economics", "PPFs", ["1.1.4"]],
  ["14", "Nature of Economics", "Specialisation & Division of Labour", ["1.1.5"]],
  ["14", "Nature of Economics", "Rational Decision Making", ["1.2.1"]],
  ["14", "Demand", "All Introduction to Demand", ["1.2.2"]],
  ["14", "Demand", "Price Elasticity of Demand (PED)", ["1.2.3"]],
  ["14", "Demand", "Total Revenue", ["1.2.3"]],
  ["14", "Demand", "Shifts in Demand", ["1.2.2"]],
  ["14", "Demand", "Income Elasticity of Demand (YED)", ["1.2.3"]],
  ["14", "Demand", "Cross Elasticity of Demand (XED)", ["1.2.3"]],
  ["14", "Supply", "Introduction to Supply", ["1.2.4"]],
  ["14", "Supply", "Price Elasticity of Supply (PES)", ["1.2.5"]],
  ["14", "Supply", "Shifts in Supply", ["1.2.4"]],
  ["14", "Price Mechanism", "Price Determination", ["1.2.6", "1.2.7"], "1.2.6 / 1.2.7"],
  ["14", "Price Mechanism", "Supply & Demand Shifts", ["1.2.6"]],
  ["14", "Consumer & Producer Surplus", "Consumer and Producer Surplus", ["1.2.8"]],
  ["14", "Consumer & Producer Surplus", "Change in Consumer and Producer Surplus", ["1.2.8"]],
  ["14", "Indirect Taxation & Subsidies", "Tax", ["1.2.9"]],
  ["14", "Indirect Taxation & Subsidies", "Subsidies", ["1.2.9"]],
  ["14", "Market Failure & Government Intervention", "Market Failure and Government Intervention", ["1.3.1", "1.4.1"], "1.3.1 / 1.4.1"],
  ["14", "Market Failure & Government Intervention", "Negative Externalities", ["1.3.2"]],
  ["14", "Market Failure & Government Intervention", "Positive Externalities", ["1.3.2"]],
  ["14", "Market Failure & Government Intervention", "Public Goods", ["1.3.3"]],
  ["14", "Market Failure & Government Intervention", "Information Gaps", ["1.3.4"]],
  ["14", "Government Failure", "Types of Government Failure", ["1.4.2"]],
  ["14", "Types of Economy", "Economic Systems and Thinkers", ["1.1.6"]],

  ["15", "Macroeconomic Models", "Circular Flow of Income", ["2.4.1", "2.4.2"], "2.4.1 / 2.4.2"],
  ["15", "Macroeconomic Models", "Aggregate Demand", ["2.2.1"]],
  ["15", "Macroeconomic Models", "Shifts in AD: Income and the Multiplier", ["2.2.2", "2.4.4"], "2.2.2 / 2.4.4"],
  ["15", "Macroeconomic Models", "Shifts in AD: Interest Rates and Other Factors", ["2.2.2", "2.2.3", "2.2.4", "2.2.5"], "2.2.2-2.2.5"],
  ["15", "Macroeconomic Models", "Aggregate Supply", ["2.3.1"]],
  ["15", "Macroeconomic Models", "Shifts in AS", ["2.3.2", "2.3.3"], "2.3.2 / 2.3.3"],
  ["15", "Macroeconomic Models", "AS/AD Model", ["2.4.3"]],
  ["15", "Macroeconomic Models", "Exchange Rates", ["2.2.5", "4.1.8"], "2.2.5 / 4.1.8"],
  ["15", "Macroeconomic Models", "Labour Markets", ["2.1.3"]],
  ["15", "Government Objectives", "Inflation/Deflation", ["2.1.2"]],
  ["15", "Government Objectives", "Problems Measuring Inflation", ["2.1.2"]],
  ["15", "Government Objectives", "Effects of Inflation", ["2.1.2"]],
  ["15", "Government Objectives", "Growth", ["2.1.1"]],
  ["15", "Government Objectives", "Limitations of GDP", ["2.1.1"]],
  ["15", "Government Objectives", "Types of Unemployment", ["2.1.3"]],
  ["15", "Government Objectives", "Unemployment", ["2.1.3"]],
  ["15", "Government Objectives", "Balance of Payments", ["2.1.4"]],
  ["15", "Government Objectives", "Public Finances", ["2.6.1", "2.6.2", "4.5.3"], "2.6.1 / 2.6.2 / 4.5.3"],
  ["15", "Government Objectives", "Inequality", ["2.6.1"]],
  ["15", "Government Objectives", "Environment", ["2.6.1"]],
  ["15", "The Business Cycle & Policies", "The Business Cycle", ["2.5.2", "2.5.3"], "2.5.2 / 2.5.3"],
  ["15", "The Business Cycle & Policies", "Economic Policy", ["2.6.1", "2.6.2", "2.6.3", "2.6.4"], "2.6.1-2.6.4"],
  ["15", "The Business Cycle & Policies", "Fiscal Policy", ["2.6.2"]],
  ["15", "The Business Cycle & Policies", "Monetary Policy", ["2.6.2"]],
  ["15", "The Business Cycle & Policies", "Demand Side Responses to the Depression and Recession", ["2.6.2"]],
  ["15", "The Business Cycle & Policies", "Supply Side Policy", ["2.6.3"]],
  ["15", "The Business Cycle & Policies", "Conflicts Between Objectives", ["2.6.4"]],

  ["16", "Revenue, Costs & Profit", "Revenue", ["3.3.1"]],
  ["16", "Revenue, Costs & Profit", "Types of Costs", ["3.3.2"]],
  ["16", "Revenue, Costs & Profit", "Economies of Scale", ["3.3.3"]],
  ["16", "Revenue, Costs & Profit", "Profit", ["3.3.4"]],
  ["16", "Efficiency", "Types of Efficiency", ["3.4.1"]],
  ["16", "Business Objectives & Growth", "Business Objectives", ["3.2.1"]],
  ["16", "Business Objectives & Growth", "Business Growth", ["3.1.1", "3.1.2", "3.1.3"], "3.1.1-3.1.3"],
  ["16", "Market Structures", "Market Structures Introduction", ["3.4.1", "3.4.2", "3.4.3", "3.4.4", "3.4.5", "3.4.6", "3.4.7"], "3.4.1-3.4.7"],
  ["16", "Market Structures", "Monopoly", ["3.4.5"]],
  ["16", "Market Structures", "Perfect Competition", ["3.4.2"]],
  ["16", "Market Structures", "Monopolistic Competition", ["3.4.3"]],
  ["16", "Market Structures", "Oligopoly", ["3.4.4"]],
  ["16", "Market Structures", "Contestability", ["3.4.7"]],
  ["16", "Market Structures", "Pros and Cons of Market Structures", ["3.4.1", "3.4.2", "3.4.3", "3.4.4", "3.4.5", "3.4.6", "3.4.7"], "3.4.1-3.4.7"],
  ["16", "Regulation & Competition Policy", "Regulation and Competition Policy", ["3.6.1", "3.6.2"], "3.6.1 / 3.6.2"],
  ["16", "Labour Markets", "Labour Markets Introduction", ["3.5.1", "3.5.2", "3.5.3"], "3.5.1-3.5.3"],
  ["16", "Labour Markets", "Labour Market Elasticities", ["3.5.3"]],
  ["16", "Labour Markets", "Labour Market Shifts", ["3.5.1", "3.5.2", "3.5.3"], "3.5.1-3.5.3"],
  ["16", "Labour Markets", "Monopsony", ["3.4.6", "3.5.2", "3.5.3"], "3.4.6 / 3.5.2 / 3.5.3"],

  ["17", "The Global Economy I", "Specialisation and Trade", ["4.1.2"]],
  ["17", "The Global Economy I", "Globalisation", ["4.1.1"]],
  ["17", "The Global Economy I", "Terms of Trade", ["4.1.4"]],
  ["17", "The Global Economy I", "Restrictions on Free Trade", ["4.1.6"]],
  ["17", "The Global Economy I", "Trading Blocs", ["4.1.5"]],
  ["17", "The Global Economy II", "The World Trade Organisation", ["4.1.5"]],
  ["17", "The Global Economy II", "Patterns of Trade", ["4.1.3"]],
  ["17", "The Global Economy II", "Balance of Payments", ["4.1.7"]],
  ["17", "The Global Economy II", "Factors Affecting Exchange Rates", ["4.1.8"]],
  ["17", "The Global Economy II", "Impacts of Changes in Exchange Rates", ["4.1.8"]],
  ["17", "The Global Economy II", "Exchange Rate Systems", ["4.1.8"]],
  ["17", "The Global Economy II", "International Competitiveness", ["4.1.9"]],
  ["17", "Poverty and Inequality", "Poverty", ["4.2.1"]],
  ["17", "Poverty and Inequality", "Inequality", ["4.2.2"]],
  ["17", "Poverty and Inequality", "Capitalism, Growth and Inequality", ["4.2.2"]],
  ["17", "Emerging and Developing Economies I", "Measures of Development", ["4.3.1"]],
  ["17", "Emerging and Developing Economies II", "Education and Skills", ["4.3.2"]],
  ["17", "Emerging and Developing Economies II", "Infrastructure", ["4.3.2"]],
  ["17", "Emerging and Developing Economies II", "Health", ["4.3.2"]],
  ["17", "Emerging and Developing Economies II", "Population Growth", ["4.3.2"]],
  ["17", "Emerging and Developing Economies II", "Savings Gaps", ["4.3.2"]],
  ["17", "Emerging and Developing Economies II", "Property Rights", ["4.3.2"]],
  ["17", "Emerging and Developing Economies II", "Corruption", ["4.3.2"]],
  ["17", "Emerging and Developing Economies II", "Landlocked Countries", ["4.3.2"]],
  ["17", "Emerging and Developing Economies II", "Infant Industries", ["4.3.3"]],
  ["17", "Emerging and Developing Economies II", "Primary Product Dependency and PED", ["4.3.2"]],
  ["17", "Emerging and Developing Economies II", "Primary Product Dependency and YED", ["4.3.2"]],
  ["17", "Emerging and Developing Economies II", "Foreign Currency Gaps", ["4.3.2"]],
  ["17", "Emerging and Developing Economies III", "The World Bank, IMF and NGOs", ["4.3.3"]],
  ["17", "The Financial Sector", "Role of Financial Markets", ["4.4.1"]],
  ["17", "The Financial Sector", "Market Failure in the Financial Sector", ["4.4.2"]],
  ["17", "The Financial Sector", "Role of Central Banks", ["4.4.3"]],
  ["17", "The Role of the State", "Taxation", ["4.5.2"]],
  ["17", "The Role of the State", "Public Expenditure", ["4.5.1"]],
  ["17", "The Role of the State", "Public Sector Finances", ["4.5.3"]],
  ["17", "Policies in a Global Context", "The Policy Toolkit", ["4.5.4"]],
  ["17", "Policies in a Global Context", "The Policies in a Global Context", ["4.5.4"]],
];

const TOPIC_SPEC_MAP = new Map(
  TOPIC_SPEC_ENTRIES.map(([moduleId, section, name, codes, label = null]) => [
    `${moduleId}::${section}::${name}`,
    { codes, label },
  ]),
);

const RESOURCE_SPEC_ENTRIES = [
  ["16", "Market Structures", "Market Structures Introduction", "videos", "Introduction to Market Structures", ["3.4.1"], "3.4.1"],
  ["16", "Market Structures", "Market Structures Introduction", "videos", "N-Firm Concentration Ratios", ["3.4.1"], "3.4.1"],
  ["16", "Market Structures", "Pros and Cons of Market Structures", "videos", "Disadvantages of Monopolies for Consumers", ["3.4.5"], "3.4.5"],
  ["16", "Market Structures", "Pros and Cons of Market Structures", "videos", "Advantages of Monopolies for Consumers", ["3.4.5"], "3.4.5"],
  ["16", "Market Structures", "Pros and Cons of Market Structures", "videos", "Advantages of Monopolies for Firms", ["3.4.5"], "3.4.5"],
  ["16", "Market Structures", "Pros and Cons of Market Structures", "videos", "Disadvantages of Monopolies for Firms", ["3.4.5"], "3.4.5"],
  ["16", "Market Structures", "Pros and Cons of Market Structures", "videos", "Monopolies and Monopsonies", ["3.4.5", "3.4.6"], "3.4.5 / 3.4.6"],
  ["16", "Market Structures", "Pros and Cons of Market Structures", "videos", "The Advantages of Perfect Competition", ["3.4.2"], "3.4.2"],
  ["16", "Market Structures", "Pros and Cons of Market Structures", "videos", "The Disadvantages of Perfect Competition", ["3.4.2"], "3.4.2"],
  ["16", "Market Structures", "Pros and Cons of Market Structures", "videos", "Oligopolies and Consumers", ["3.4.4"], "3.4.4"],
  ["17", "The Global Economy I", "Specialisation and Trade", "videos", "Trade Barriers", ["4.1.6"], "4.1.6"],
];

const RESOURCE_SPEC_MAP = new Map(
  RESOURCE_SPEC_ENTRIES.map(([moduleId, section, topicName, resourceGroup, resourceTitle, codes, label = null]) => [
    `${moduleId}::${section}::${topicName}::${resourceGroup}::${resourceTitle}`,
    { codes, label },
  ]),
);

function getTopicPrimaryPrefix(codes) {
  for (const code of codes || []) {
    const match = String(code).match(/^(\d+\.\d+)/);
    if (match) return match[1];
  }
  return null;
}

function formatCodes(codes, label = null) {
  return label || (codes && codes.length ? codes.join(" / ") : "");
}

function applySpecAnnotation(target, specCodes, explicitLabel = null) {
  const specCodeLabel = formatCodes(specCodes, explicitLabel);
  const primaryPrefix = getTopicPrimaryPrefix(specCodes);
  const primarySectionTitle = primaryPrefix ? SPEC_SECTION_TITLES[primaryPrefix] || null : null;
  const isSupplemental = specCodes.length === 0;

  target.specCodes = specCodes;
  target.specCodeLabel = specCodeLabel;
  target.specPrimaryPrefix = primaryPrefix;
  target.specSectionLabel = primaryPrefix && primarySectionTitle ? `${primaryPrefix} ${primarySectionTitle}` : primaryPrefix || "";
  target.specTag = isSupplemental ? "Supplemental" : `Spec ${specCodeLabel}`;
  target.specSupplemental = isSupplemental;
}

export function getSectionSpecSummary(topics) {
  const prefixes = [...new Set(
    (topics || [])
      .flatMap((topic) => topic.specCodes || [])
      .map((code) => String(code).match(/^(\d+\.\d+)/)?.[1] || null)
      .filter(Boolean),
  )];
  return prefixes.length ? prefixes.join(" / ") : null;
}

export function annotateCatalogWithSpec(catalog) {
  for (const module of catalog.modules || []) {
    const moduleMeta = MODULE_SPEC_META[module.id] || null;
    if (moduleMeta) {
      module.specThemeCode = moduleMeta.themeCode;
      module.specRange = moduleMeta.specRange;
      module.specThemeTitle = moduleMeta.themeTitle;
    }

    for (const topic of module.topics || []) {
      const mapping = TOPIC_SPEC_MAP.get(`${module.id}::${topic.section}::${topic.name}`);
      const specCodes = mapping?.codes || [];

      topic.moduleId = module.id;
      applySpecAnnotation(topic, specCodes, mapping?.label || null);

      for (const [resourceGroup, items] of [
        ["quizzes", topic.quizzes || []],
        ["videos", topic.videos || []],
        ["articleLessons", topic.articleLessons || []],
      ]) {
        for (const item of items) {
          applySpecAnnotation(item, topic.specCodes, mapping?.label || null);
          const resourceMapping = RESOURCE_SPEC_MAP.get(
            `${module.id}::${topic.section}::${topic.name}::${resourceGroup}::${item.title}`,
          );
          if (resourceMapping) {
            applySpecAnnotation(item, resourceMapping.codes, resourceMapping.label || null);
          }
        }
      }
    }
  }

  return catalog;
}
