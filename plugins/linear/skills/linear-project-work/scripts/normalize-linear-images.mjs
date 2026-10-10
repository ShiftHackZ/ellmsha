import { pathToFileURL } from 'node:url';

const LINEAR_UPLOAD_ORIGIN = 'https://uploads.linear.app';
const LINEAR_IMAGE_PATTERN = /<linear-image>([\s\S]*?)<\/linear-image>/g;

export function normalizeLinearImages(markdown) {
  return markdown.replace(LINEAR_IMAGE_PATTERN, (node, payload) => {
    try {
      const image = JSON.parse(payload);
      const source = image?.type === 'image' ? image.attrs?.src : undefined;
      if (
        typeof source !== 'string' ||
        /[\s()<>\\]/u.test(source) ||
        new URL(source).origin !== LINEAR_UPLOAD_ORIGIN
      ) {
        return node;
      }
      return `![Linear image](${source})`;
    } catch {
      return node;
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdin.setEncoding('utf8');
  let input = '';
  process.stdin.on('data', (chunk) => {
    input += chunk;
  });
  process.stdin.on('end', () => {
    process.stdout.write(normalizeLinearImages(input));
  });
}
