// The slice of the `chrome.*` extension API this package uses (no @types/chrome dependency).
declare namespace chrome {
  namespace runtime {
    interface Port {
      name: string;
      sender?: { tab?: { id?: number }; frameId?: number };
      postMessage(message: unknown): void;
      disconnect(): void;
      onMessage: { addListener(cb: (message: unknown) => void): void };
      onDisconnect: { addListener(cb: () => void): void };
    }
    function connect(info: { name: string }): Port;
    const onConnect: { addListener(cb: (port: Port) => void): void };
    const lastError: { message?: string } | undefined;
  }
  namespace action {
    function setBadgeText(details: { tabId: number; text: string }): Promise<void> | void;
    function setBadgeBackgroundColor(details: { tabId: number; color: string }): Promise<void> | void;
    function setTitle(details: { tabId: number; title: string }): Promise<void> | void;
  }
  namespace tabs {
    function create(props: { url: string }): void;
  }
  namespace devtools {
    namespace inspectedWindow {
      const tabId: number;
      function eval(expression: string, callback: (result: unknown, exception?: { isException?: boolean; value?: string; description?: string }) => void): void;
    }
    namespace panels {
      const themeName: string;
      interface ExtensionPanel {
        onShown: { addListener(cb: () => void): void };
        onHidden: { addListener(cb: () => void): void };
      }
      function create(title: string, iconPath: string, pagePath: string, callback?: (panel: ExtensionPanel) => void): void;
    }
  }
}
