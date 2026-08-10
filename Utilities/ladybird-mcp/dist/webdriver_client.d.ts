export interface WebDriverSession {
    sessionId: string;
}
export interface AXNode {
    id: number;
    role: string;
    name: string;
    value?: string;
    bounds?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    children?: AXNode[];
}
export declare class LadybirdWebDriverClient {
    private baseUrl;
    private currentSessionId;
    constructor(baseUrl?: string);
    private request;
    ensureSession(): Promise<string>;
    navigate(url: string): Promise<void>;
    getCurrentUrl(): Promise<string>;
    takeScreenshot(): Promise<string>;
    executeScript(script: string, args?: any[]): Promise<any>;
    findElement(using: string, value: string): Promise<string>;
    clickElement(elementId: string): Promise<void>;
    sendKeysToElement(elementId: string, text: string): Promise<void>;
    closeSession(): Promise<void>;
}
