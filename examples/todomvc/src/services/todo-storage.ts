/** Where todos are persisted. Replace this provider in tests. */
export class TodoStorage {
  static scope = 'root';

  load(): string | null {
    return localStorage.getItem('todos-gable');
  }

  save(raw: string): void {
    localStorage.setItem('todos-gable', raw);
  }
}
