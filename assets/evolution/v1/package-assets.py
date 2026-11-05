from pathlib import Path
from PIL import Image
import json, html

root=Path(__file__).resolve().parent
labels=['起步','精實','結實','壯碩','大隻佬']
wardrobe=['基本背心','街角外套','力量背心','珊瑚短袖','夜跑外套','會員紀念外套']
assets=[]
for folder in ['characters','wardrobe','backgrounds']:
    for p in sorted((root/folder).glob('*.png')):
        im=Image.open(p); im.load()
        entry=dict(id=p.stem,label=p.stem,file=p.relative_to(root).as_posix(),width=im.width,height=im.height,kind=folder,mode=im.mode)
        if folder=='characters':
            n=int(p.stem.split('-')[2]); entry['label']=f'C01 {n} {labels[n-1]} '+('街角外套 ' if 'jacket' in p.stem else '')+('正面' if p.stem.endswith('front') else '背面')
        elif p.stem.startswith('top-'):entry['label']=wardrobe[int(p.stem.split('-')[1])-1]
        else:entry['label']={'bottom-01-navy-shorts':'深藍短褲','bottom-02-training-joggers':'訓練長褲','bottom-03-light-shorts':'淺色短褲','shoes-01-white-trainers':'白色運動鞋','shoes-02-navy-runners':'深藍跑鞋','accessory-01-headband':'頭帶','accessory-02-wristbands':'護腕','accessory-03-towel':'運動毛巾','locker-room-empty':'更衣室空背景'}.get(p.stem,p.stem)
        if 'A' in im.getbands():
            a=im.getchannel('A'); hist=a.histogram()
            entry['alphaRange']=a.getextrema();entry['transparentFraction']=round(hist[0]/(im.width*im.height),4)
            entry['solidBounds']=a.point(lambda x:255 if x>=240 else 0).getbbox()
            entry['hasTransparency']=hist[0]>0
            assert entry['hasTransparency'],p
            b=entry['solidBounds']; entry['anchorPixels']=[round((b[0]+b[2])/2),b[3]]
            entry['edgeClear']=all(a.getpixel(pt)==0 for pt in [(0,0),(im.width-1,0),(0,im.height-1),(im.width-1,im.height-1)])
            assert entry['edgeClear'],p
        else:entry['hasTransparency']=False
        entry['usage']='inventory-icon-not-wearable-layer' if folder=='wardrobe' else 'static-portrait-not-animation' if folder=='characters' else 'background'
        assets.append(entry)
assets+=json.loads((root/'vector-manifest.json').read_text(encoding='utf-8'))
manifest=dict(version=1,date='2026-11-05',character='C01',assets=assets)
(root/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
cards=[]
for a in assets:
    group=a['file'].split('/')[0]
    cards.append(f'<article data-group="{group}"><a class="art {group}" href="{a["file"]}" target="_blank"><img src="{a["file"]}" alt="{html.escape(a["label"])}"></a><strong>{html.escape(a["label"])}</strong><small>{a["width"]} × {a["height"]} · {a["file"].split(".")[-1].upper()}</small><a class="file" href="{a["file"]}" download>下載原檔</a></article>')
page='''<!doctype html><html lang="zh-HK"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pixel Gym 角色進化素材庫</title><style>
*{box-sizing:border-box}body{margin:0;background:#192332;color:#fff0d3;font:16px/1.6 "Microsoft JhengHei",sans-serif}header,main{max-width:1440px;margin:auto;padding:28px}h1{font-size:32px;margin:0}p{max-width:850px;color:#cbd7d9}nav{display:flex;gap:8px;flex-wrap:wrap;margin:22px 0}button,a{font:inherit}button{min-height:44px;border:1px solid #81e8bb;background:#273a44;color:#fff0d3;padding:8px 16px;cursor:pointer;border-radius:6px}button.active{background:#81e8bb;color:#192332}button:focus-visible,a:focus-visible{outline:3px solid #ffcc78;outline-offset:3px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:20px}article{padding-bottom:16px;min-width:0;border-bottom:1px solid #4c6069}article[hidden]{display:none}.art{height:240px;display:flex;align-items:center;justify-content:center;background-color:#263b43;background-image:conic-gradient(#ffffff08 25%,transparent 0 50%,#ffffff08 0 75%,transparent 0);background-size:24px 24px;border-radius:8px}.art.characters{height:360px}.art img{max-width:94%;max-height:94%;object-fit:contain;image-rendering:pixelated}.art.ui img,.art.muscles img{max-width:84%;max-height:160px}.art.backgrounds{height:240px}strong,small{display:block;margin:8px 0 0}small{color:#a9bec4}.file{font-size:14px;color:#81e8bb}body.light .art{background-color:#eee8dc;background-image:conic-gradient(#00000008 25%,transparent 0 50%,#00000008 0 75%,transparent 0)}.links a{color:#81e8bb;margin-right:20px}#count{color:#81e8bb}footer{padding:30px;text-align:center;color:#a9bec4}@media(max-width:600px){header,main{padding:18px}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.art.characters{height:260px}.art{height:160px}h1{font-size:25px}}
</style><header><h1>角色進化素材庫</h1><p>C01 的五階段正背面、獨立衣物、空背景及介面元件。每張圖可單獨開啟或下載；切換底色可檢查透明邊緣。</p><p>衣物目前是收藏縮圖；角色是穿基本服裝的靜態立繪。貼身換裝圖層及行走／訓練動畫需在正式製作時另行適配。</p><div class="links"><a href="README.txt">使用說明</a><a href="manifest.json">素材索引</a><a href="prompts.json">生成紀錄</a></div><nav id="filters"><button class="active" data-filter="all">全部</button><button data-filter="characters">角色</button><button data-filter="wardrobe">衣物配件</button><button data-filter="backgrounds">背景</button><button data-filter="ui">介面</button><button data-filter="muscles">肌群圖示</button></nav><button id="bg" aria-pressed="false">切換淺色底</button> <span id="count"></span></header><main class="grid">'''+''.join(cards)+'''</main><footer>Pixel Gym · 素材包 v1 · 2026-11-05</footer><script>
const cards=[...document.querySelectorAll('article')];const count=()=>document.querySelector('#count').textContent=cards.filter(c=>!c.hidden).length+' 個素材';count();document.querySelector('#filters').onclick=e=>{const b=e.target.closest('[data-filter]');if(!b)return;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));cards.forEach(c=>c.hidden=b.dataset.filter!=='all'&&c.dataset.group!==b.dataset.filter);count()};document.querySelector('#bg').onclick=e=>{const light=document.body.classList.toggle('light');e.target.textContent=light?'切換深色底':'切換淺色底';e.target.setAttribute('aria-pressed',light)};
</script></html>'''
(root/'index.html').write_text(page,encoding='utf-8')
print(json.dumps({'count':len(assets),'png':sum(a['file'].endswith('.png') for a in assets),'svg':sum(a['file'].endswith('.svg') for a in assets),'transparentPng':sum(a.get('hasTransparency',False) for a in assets)},ensure_ascii=False))
