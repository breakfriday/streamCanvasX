interface Data {
    id: number;
    version: string;
}

interface Resource {
    version: string;
    data: string[];
}

interface Condition {
    type: string;
    condition: {
        name: string;
        options: string[];
    };
}

interface Rule {
    rulesId: number;
    dataId: number;
    desc: string;
    conditions: Condition[];
}

interface RuleEngineConfig {
    data: Data[];
    resources: Resource[];
    rules: Rule[];
}
