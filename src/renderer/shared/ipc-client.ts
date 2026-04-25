export const ipc = {
  invoke<T = any>(channel: string, req?: any): Promise<T> {
    return window.electron.invoke(channel, req);
  },
  on(channel: string, cb: (data: any) => void): void {
    window.electron.on(channel, cb);
  },
  off(channel: string): void {
    window.electron.off(channel);
  },
};
