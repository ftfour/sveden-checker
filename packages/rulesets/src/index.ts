import { readFileSync } from "node:fs";

export type SvedenRuleItem = {
  key: string;
  title: string;
  type: "itemprop" | "itempropLink";
  itemprop: string;
  required: boolean;
  parentItemprop?: string;
  legalSourceId: string;
  severity: "error" | "warning" | "info";
};

export type SvedenRuleSection = {
  section: string;
  title: string;
  path: string;
  items: SvedenRuleItem[];
};

export type SvedenRuleset = {
  sections: SvedenRuleSection[];
};

export function getSvedenItempropRuleset(): SvedenRuleset {
  return JSON.parse(readFileSync(new URL("./sveden-itemprop-ruleset.json", import.meta.url), "utf8")) as SvedenRuleset;
}

export const futureCheckSections = [
  "Основные сведения",
  "Структура и органы управления",
  "Документы",
  "Образование",
  "Руководство",
  "Материально-техническое обеспечение",
  "Доступная среда",
  "Платные образовательные услуги",
  "Финансово-хозяйственная деятельность",
  "Вакантные места",
  "Стипендии",
  "Организация питания",
  "Международное сотрудничество"
] as const;
