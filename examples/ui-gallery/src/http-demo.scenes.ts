import type { ComponentScenes } from '@gable/core/tooling';
import './styles.css';
import { UserList, type User } from './http-demo.js';

const users: User[] = [
  { id: 1, name: 'Ada Lovelace', role: 'Engineer' },
  { id: 2, name: 'Grace Hopper', role: 'Admiral' },
  { id: 3, name: 'Edsger Dijkstra', role: 'Professor' },
];

// One file, two modes: the Designer's component mode mounts `UserList` alone in each situation, and page mode applies the
// same scenario to the real page (`/http.html`). `@gable/testing`'s `mountScene` runs them too (`http-demo.test.ts`).
export default {
  component: UserList,
  scenes: {
    Loaded: { description: 'Three users', http: [{ method: 'GET', url: '/api/users', reply: { body: users } }] },
    Empty: { description: 'The list is empty', http: [{ method: 'GET', url: '/api/users', reply: { body: [] } }] },
    Slow: { description: 'Answers after 3 seconds', http: [{ method: 'GET', url: '/api/users', reply: { body: users, delay: 3000 } }] },
    'Server error': {
      description: 'The server answers 500',
      http: [{ method: 'GET', url: '/api/users', reply: { status: 500, statusText: 'Server Error', body: { message: 'boom' } } }],
    },
    Offline: { description: 'The network is down', http: [{ method: 'GET', url: '/api/users', reply: { error: 'network' } }] },
  },
} satisfies ComponentScenes<UserList>;
