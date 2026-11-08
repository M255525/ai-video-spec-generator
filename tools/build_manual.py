# 組合 manual.html：manual_body.html＋tools/creator_block.html（創作者完整版，與其他工具同一份）
import os
here = os.path.dirname(os.path.abspath(__file__))
block = open(os.path.join(here, 'creator_block.html'), encoding='utf-8').read().strip()
body = open(os.path.join(here, 'manual_body.html'), encoding='utf-8').read()
open(os.path.join(here, '..', 'manual.html'), 'w', encoding='utf-8', newline='\n').write(body.replace('{{CREATOR}}', block))
print(len(block))
