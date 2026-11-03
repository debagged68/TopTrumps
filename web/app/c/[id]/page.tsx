// Short invitation link: /c/<challenge-id>#<key>. Same landing as /challenge/<id>; the key
// stays in the URL fragment, so it is never sent to the server or written to its logs.
export { metadata, dynamic, default } from '../../challenge/[id]/page';
