export interface NemesisConfig {
  targetUrl: string;
  maxPages: number;
  headless: boolean;
  timeout: number;
  screenshotDir: string;
  outputDir: string;
  /** Path to a demo app to auto-launch before scanning */
  demoAppPath?: string;
  /** Authentication config for the target app */
  auth?: {
    type: 'form-login' | 'idp-login' | 'cookie' | 'bearer' | 'basic' | 'none';
    loginUrl?: string;
    username?: string;
    password?: string;
    token?: string;
    cookies?: Record<string, string>;
    usernameField?: string;
    passwordField?: string;
    /** CSS selector for the button that initiates the IDP redirect (for idp-login) */
    loginTrigger?: string;
    /** CSS selector or text for the consent/accept button on the IDP consent page */
    consentButton?: string;
    /** URL pattern to wait for after IDP login completes (substring match on final URL) */
    postLoginUrlPattern?: string;
  };
}

export type AttackCategory = 'injection' | 'xss' | 'auth' | 'traversal' | 'validation' | 'dos' | 'cors' | 'csrf' | 'functional' | 'exploratory';

export interface PageMap {
  url: string;
  title: string;
  forms: FormInfo[];
  links: LinkInfo[];
  inputs: InputInfo[];
  cookies: CookieInfo[];
  headers: Record<string, string>;
  screenshot?: string;
  htmlSnippet: string;
}

export interface FormInfo {
  action: string;
  method: string;
  inputs: InputInfo[];
  selector: string;
}

export interface InputInfo {
  name: string;
  type: string;
  selector: string;
  placeholder?: string;
  label?: string;
  required: boolean;
}

export interface LinkInfo {
  href: string;
  text: string;
  isInternal: boolean;
}

export interface CookieInfo {
  name: string;
  value: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: string;
}

export interface AttackPlan {
  pageUrl: string;
  attacks: Attack[];
}

export interface Attack {
  id: string;
  category: AttackCategory;
  name: string;
  description: string;
  target: AttackTarget;
  payloads: string[];
  successIndicators: string[];
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface AttackTarget {
  type: 'form' | 'url-param' | 'header' | 'cookie' | 'direct-url';
  selector?: string;
  inputName?: string;
  url?: string;
}

export interface AttackResult {
  attack: Attack;
  pageUrl: string;
  success: boolean;
  evidence: string;
  screenshot?: string;
  responseCode?: number;
  responseBody?: string;
  duration: number;
  reproductionSteps: string[];
  timestamp: string;
}

export interface NemesisReport {
  target: string;
  startedAt: string;
  completedAt: string;
  duration: number;
  pagesScanned: number;
  attacksExecuted: number;
  vulnerabilitiesFound: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  pages: PageMap[];
  results: AttackResult[];
  timeToFirstBreach?: number;
}
