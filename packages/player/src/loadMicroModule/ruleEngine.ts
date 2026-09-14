function domain(currentDomain: string, options: string[]): boolean {
    return options.some(option => {
        // 转义除了*之外的正则特殊字符
        const escapedOption = option.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

        // 将*替换为.*（匹配任意字符的正则表达式）
        const pattern = escapedOption.replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}$`);

        // 测试当前域名是否匹配该模式
        return regex.test(currentDomain);
    });
}

class RuleEngine {
    private config: RuleEngineConfig;

    constructor(config: RuleEngineConfig) {
        this.config = config;
    }

    evaluate(query: {currentDomain: string}): number | null {
        let { currentDomain } = query;
        for (const rule of this.config.rules) {
            let isRuleSatisfied = true;

            for (const condition of rule.conditions) {
                if (condition.type === 'and' && condition.condition.name === 'domain') {
                    if (!domain(currentDomain, condition.condition.options)) {
                        isRuleSatisfied = false;
                        break;
                    }
                }
                // 这里可以添加更多条件类型的处理逻辑
            }

            if (isRuleSatisfied) {
                return rule.dataId;
            }
        }

        // 如果没有符合条件的规则
        return null;
    }
}


export default RuleEngine;