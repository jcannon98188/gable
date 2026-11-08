| case | screen point | expected | got | ok |
|---|---|---|---|---|
| button centre | (1006.7, 569.4) | button | button | PASS |
| card body (empty area) | (1000.8, 216.5) | card3d | card3d | PASS |
| row-0 centre | (1087.6, 425.7) | row-0 | row-0 | PASS |
| row-1 centre | (1084.0, 469.8) | row-1 | row-1 | PASS |
| row-2 centre | (1080.3, 514.6) | row-2 | row-2 | PASS |
| row-3 centre | (1076.5, 560.0) | card3d | card3d | PASS |
| row-4 centre | (1072.7, 606.2) | card3d | card3d | PASS |
| row-5 centre | (1068.8, 653.1) | none | none | PASS |
| row-0 portion above inner clip | (1088.8, 411.8) | card3d | card3d | PASS |
| row-0 portion inside inner clip | (1087.9, 422.7) | row-0 | row-0 | PASS |
| inside card, outside scroller rounded corner | (979.6, 409.9) | card3d | card3d | PASS |
| outside quad (left of top-left corner) | (980.5, 211.4) | none | none | PASS |
| inside unrotated rect, outside rotated quad | (942.0, 605.0) | none-or-other | none | PASS |

failures: 0
projected left edge 386.1px vs right edge 450.2px (perspective foreshortening)
