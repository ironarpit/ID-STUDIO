with open('src/components/ProductDetailModal.tsx', 'r') as f:
    content = f.read()

target = '            {/* SECTION 4: SUPPLIER AND LAST PURCHASE (Promoted Prominently) */}'

widget = '''            {/* MANUAL PHYSICAL STOCK & VARIATION WIDGET */}
            <div className={`p-3 rounded-xl border ${currentVariation ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700' : 'bg-slate-50/80 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'} space-y-2.5`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Physical Stock Count & Variation
                  </span>
                  {currentVariation && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-200">
                      STOCK VARIATION
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-slate-500 font-medium">
                  System: {systemStock}
                </span>
              </div>

              {currentVariation && (
                <div className="grid grid-cols-2 gap-2 text-xs font-semibold bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800">
                  <div>Adjusted Stock: <strong className="text-indigo-600 dark:text-indigo-400">{stock}</strong></div>
                  <div>Variation: <strong className={currentVariation.adjustment > 0 ? 'text-emerald-600' : 'text-rose-600'}>{currentVariation.adjustment > 0 ? `+${currentVariation.adjustment}` : currentVariation.adjustment}</strong></div>
                  <div className="col-span-2 text-[11px] text-slate-500">
                    Last Count: {currentVariation.physicalStock} on {new Date(currentVariation.timestamp).toLocaleDateString('en-GB')}
                    {currentVariation.remark ? ` (${currentVariation.remark})` : ''}
                  </div>
                  {stock < 0 && (
                    <div className="col-span-2 text-[11px] text-rose-600 font-bold">
                      Recount needed: Adjusted stock is negative.
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="any"
                  placeholder="Total Physical Count (Floor + WH)"
                  value={physicalInput}
                  onChange={(e) => setPhysicalInput(e.target.value)}
                  className="flex-1 px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleSavePhysical}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer shrink-0"
                >
                  Set Physical
                </button>
                {currentVariation && (
                  <button
                    type="button"
                    onClick={handleRemoveVariation}
                    className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 dark:bg-rose-950 dark:text-rose-300 rounded-xl text-xs font-bold cursor-pointer shrink-0"
                  >
                    Remove
                  </button>
                )}
              </div>

              {variationMsg && (
                <div className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                  {variationMsg}
                </div>
              )}

              <p className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                Adjustment remains active across uploads. Recount or remove it when the retail system corrects its stock.
              </p>
            </div>

            {/* SECTION 4: SUPPLIER AND LAST PURCHASE (Promoted Prominently) */}'''

if target in content:
    content = content.replace(target, widget, 1)
    with open('src/components/ProductDetailModal.tsx', 'w') as f:
        f.write(content)
    print('Patched ProductDetailModal successfully')
else:
    print('Target not found in ProductDetailModal')
