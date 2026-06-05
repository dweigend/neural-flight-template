$repo = "C:\Users\Lenovo\OneDrive\Documents\Uni\KD\HP_Embodied Flight\neural-flight-vt-fork"
Set-Location -LiteralPath $repo
git push origin ll 2>&1 | Out-File -Append -LiteralPath "$repo\src\lib\experiences\visio-technologica\lennard\scripts\push.log"
