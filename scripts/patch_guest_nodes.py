import re

path = 'backend/apps/library/views/nodes.py'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Replace permission_classes on NodeListCreateView, NodeClaimView, NodePendingView
text = re.sub(
    r'(class NodeListCreateView\(APIView\):[\s\S]*?permission_classes\s*=\s*)\(permissions\.IsAuthenticated,\)',
    r'\1(AllowAnyOrLocalGuest,)',
    text
)

text = re.sub(
    r'(class NodeClaimView\(APIView\):[\s\S]*?permission_classes\s*=\s*)\(permissions\.IsAuthenticated,\)',
    r'\1(AllowAnyOrLocalGuest,)',
    text
)

text = re.sub(
    r'(class NodePendingView\(APIView\):[\s\S]*?permission_classes\s*=\s*)\(permissions\.IsAuthenticated,\)',
    r'\1(AllowAnyOrLocalGuest,)',
    text
)

with open(path, 'w', encoding='utf-8', newline='') as f:
    f.write(text)

print("Updated views permission_classes")
