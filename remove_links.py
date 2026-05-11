import os
import re

files = [
    'c:/Users/Dell/Documents/GitHub/bidhanpokhrel.github.io/privacy-policy/ludo-privacy.html',
    'c:/Users/Dell/Documents/GitHub/bidhanpokhrel.github.io/privacy-policy/Baag-Chaal_Privacy.html'
]

for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # Remove the back to portfolio link
    content = re.sub(r'<a href="index\.html" class="nav-link">.*?</a>', '', content, flags=re.DOTALL)
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)
