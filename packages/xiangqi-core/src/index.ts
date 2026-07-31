/**
 * 确定性中国象棋领域层的唯一公共入口。
 *
 * 此文件目前刻意不实现规则：Plan 002 必须先审查并锁定一款具备合格许可证、
 * 标准走法、将军、将死、困毙及局面恢复能力的规则引擎，再填充以下 API。
 * UI、API 与 LLM 网关都不得绕过此 package 自己判定规则。
 */
export type { GameOutcome, LegalMove, Side } from '@llm-chess/shared';

export type XiangqiEngineSelection = {
  packageName: string;
  version: string;
  license: string;
  documentedLimitations: readonly string[];
};

/**
 * 规则库尚未审查/安装时的显式占位错误。
 * 不允许以随机落子、LLM 判断或不完整手写规则替代。
 */
export class XiangqiEngineNotConfiguredError extends Error {
  public constructor() {
    super('中国象棋规则引擎尚未完成审查与配置。');
    this.name = 'XiangqiEngineNotConfiguredError';
  }
}
