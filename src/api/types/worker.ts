export type WorkerMode = "main" | "worker" | "offscreen";

export type WorkerStatus = {
  available: boolean;
  mode: WorkerMode;
  reason?: string;
};

export type WorkerAdapter<Message = unknown> = {
  post(message: Message, transfer?: Transferable[]): void;
  onMessage(handler: (message: Message) => void): () => void;
  terminate(): void;
  supportsOffscreenCanvas?: boolean;
};
