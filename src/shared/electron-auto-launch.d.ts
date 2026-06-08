// 类型声明：electron-auto-launch（无官方类型包）
declare module 'electron-auto-launch' {
  interface AutoLaunchOptions {
    name: string;
    isHidden?: boolean;
  }

  class AutoLaunch {
    constructor(options: AutoLaunchOptions);
    isEnabled(): Promise<boolean>;
    enable(): Promise<void>;
    disable(): Promise<void>;
  }

  export = AutoLaunch;
}
