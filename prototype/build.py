import sys
d=sys.argv[1]
sh=open(d+'/shell.html').read(); en=open(d+'/engine.js').read(); ap=open(d+'/app.js').read()
out=sh.replace('/*ENGINE*/',en).replace('/*APP*/',ap)
assert '</script' not in en and '</script' not in ap
open(sys.argv[2],'w').write(out); print(len(out))
