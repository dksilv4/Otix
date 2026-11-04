import re

path = 'desktop/node-daemon.ts'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read().replace('\r\n', '\n')

old_code = '''  public async ensureClaimed(authToken?: string): Promise<boolean> {
    const token = authToken || this.currentAuthToken;
    if (!token) return false;

    const port = this.currentPort;'''

new_code = '''  public async ensureClaimed(authToken?: string): Promise<boolean> {
    const token = authToken || this.currentAuthToken || '';

    const port = this.currentPort;'''

assert old_code in text, "old_code not found"
text = text.replace(old_code, new_code)

old_headers = '''              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },'''

new_headers = '''              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },'''

assert old_headers in text, "old_headers not found"
text = text.replace(old_headers, new_headers)

old_headers2 = '''        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },'''

new_headers2 = '''        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },'''

assert old_headers2 in text, "old_headers2 not found"
text = text.replace(old_headers2, new_headers2)

with open(path, 'w', encoding='utf-8', newline='') as f:
    f.write(text.replace('\n', '\r\n'))

print("Updated desktop/node-daemon.ts")
