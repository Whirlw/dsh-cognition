# P7 执行数据(去 gold 化实验,agent 结果记录)

> 每卡:任务号、通过/失败、改动文件、suggest 命中情况(**precedent 通道状态:on/off、先例文件是否出现在 suggested**)、
> reorient 次数与 evidence 类型、ritual 摘要、耗时。追加式记录。
> 协议:P6_LONG_TERM_PROTOCOL 装置 + P7_EXPERIMENT_PROMPT 去 gold 纪律(evidence 仅限失败测试输出/precedent)。

## T1

- **日期**: 2026-08-15(P7 会话)
- **结果**: ✅ PASS(verify-p6-t1.mjs: 2 pass / 0 fail)
- **任务**: format('yyyy-MM-DD') 修改原实例
- **改动文件**: `bench-host/real-moment-t1/src/lib/units/era.js`(4 处 `this.startOf('day').valueOf()` → `this.clone().startOf('day').valueOf()`;getEraName/getEraNarrow/getEraAbbr/getEraYear)
- **定位证据**: ① 失败测试输出(verify 0/2 FAIL:原实例被截断为 1969-12-31);② grep `yyyy|startOf('day')` → era.js 4 处破坏性调用
- **suggest 命中**: ✅ 直接命中实现文件 era.js(suggested 第 4 位,drifted=true)
  - **precedent 通道**: state=**on**(sessions=12, scanned=17);但 support 文件全部是本会话对 experiment/ 目录的编辑噪声(`D://42427//DsH//experiment/...`,无 era.js)——era.js 进 suggested 主要靠 **learned**(learnedHit=true,置信度 90%,P6 沉淀的跨会话记忆),先例通道本卡零贡献
  - semantic=on;locale 文件占了前 3 位(af/format/bm,误导项),era.js 仍挤进前 5
- **reorient**: 0 次(era.js 已在 suggested 内,无需重定向)
- **ritual**: suggest(#56,T2)→ focus → rebind(CON405 清除)→ mutate ×4 → select(reflections=1:SKILL_DEFECT,suggest 9 文件未采用)→ guard(FAIL:GHOST_EDIT+CON405×20 陈旧 cell+CON404/422——重置装置与真相对账的噪声,同 P6 末卡 guard 形态)
- **耗时**: 约 7 分钟(含本轮 policyFor/TDZ 诊断修复后的首次全流程)

## T2

- **日期**: 2026-08-15(P7 会话)
- **结果**: ✅ PASS(verify-p6-t2.mjs: 2 pass / 0 fail)
- **任务**: isoWeeksInYear() 修改源对象
- **改动文件**: `bench-host/real-moment-t1/src/lib/units/week-year.js`(`getISOWeeksInYear` 改用只读 `this.isoWeekYear()`;删除不再引用的死常量 THURSDAY)
- **定位证据**: ① 失败测试输出(verify 1/2 FAIL:'调用后源对象不变: got 1262188800000, want 1262275200000');② grep `isoWeeksInYear` 唯一实现在 week-year.js,`this.isoWeekday(THURSDAY)` 为带参 setter 形态
- **suggest 命中**: ❌ 实现文件 week-year.js 不在 suggested(仅命中测试文件 `src/test/moment/weeks_in_year.js` 第 3 位;locale 文件占前 2)
  - **precedent 通道**: state=**on**(sessions=12, scanned=19);support 仍为本会话 experiment/ 目录噪声,无 week-year.js——先例通道本卡零贡献
  - learnedHit=true 但 week-year.js 未进前 10(P6 沉淀的 learned 条目未压过 locale 噪声)
- **reorient**: 1 次;**evidence 类型 = 失败测试输出 + 代码定位**(非 gold,符合去 gold 协议)
- **ritual**: suggest(#57,T2)→ verify 取失败输出 → grep 定位 → reorient(evidence 如上)→ rebind → mutate ×2 → select(reflections 累计 2)→ 验收 PASS
- **耗时**: 约 4 分钟

## T3

- **日期**: 2026-08-15(P7 会话)
- **结果**: ✅ PASS(verify-p6-t3.mjs: 4 pass / 0 fail)
- **任务**: 月末日期月份差值计算错误
- **改动文件**: `bench-host/real-moment-t1/src/lib/moment/diff.js`(`monthDiff` 顶部加守卫:`if (a.date() < b.date()) { return -monthDiff(b, a); }`)
- **定位证据**: ① 失败测试输出(verify 1/4 FAIL:Feb29 diff Jan31 got 0 want 1);② grep `monthDiff` 唯一实现在 diff.js,从失败样例推导:起点月天数 < 终点月天数时锚点截断、插值方向反,对调取负
- **suggest 命中**: ❌ 实现文件 diff.js 不在 suggested(仅测试文件 `src/test/moment/diff.js` 第 7 位)
  - **precedent 通道**: state=**on**(sessions=12, scanned=35);support 为本会话噪声(新增 P6_DATA.md:3、dsnle-fix-history.md:1——本会话 read 记录的 file_path),无 diff.js——先例通道本卡零贡献
  - learnedHit=true 但 diff.js 未进前 10
- **reorient**: 1 次;**evidence 类型 = 失败测试输出 + 代码分析**(非 gold)
- **ritual**: suggest(#58,T2)→ verify 取失败输出 → grep 定位 → reorient → rebind → mutate → select → 验收 PASS
- **耗时**: 约 3 分钟

## T4

- **日期**: 2026-08-15(P7 会话)
- **结果**: ✅ PASS(verify-p6-t4.mjs: 3 pass / 0 fail)
- **任务**: Y token 四位补零
- **改动文件**: `bench-host/real-moment-t1/src/lib/units/year.js`(import zeroFill;Y token 回调 `'' + y` → `zeroFill(y, 4)`)
- **定位证据**: ① 失败测试输出(verify 0/3 FAIL:got "-123"/"0"/"1");② year.js 第 14 行 Y token 回调原样拼接;③ zero-fill.js 语义验证(-123→'-0123',1→'0001')
- **suggest 命中**: ✅ 直接命中实现文件 year.js(**suggested 第 2 位**,drifted=true)
  - **precedent 通道**: state=on(scanned=33);support 全为本会话噪声(P7_DATA.md:3 等),无 year.js——先例零贡献,year.js 命中靠 semantic/learned
- **reorient**: 0 次
- **ritual**: suggest(#59,T2)→ verify 取失败输出 → focus → rebind → mutate ×2(含 overlay_import)→ select(reflections=1:SKILL_DEFECT)→ 验收 PASS
- **耗时**: 约 3 分钟

## T5

- **日期**: 2026-08-15(P7 会话)
- **结果**: ✅ PASS(verify-p6-t5.mjs: 10 pass / 0 fail)
- **任务**: strict 模式一位 token 拒绝前导零
- **改动文件**(7 个): `src/lib/parse/regex.js`(新增 match1to2NoLeadingZero=/^[1-9]\d?/、match1to2HasZero=/^([1-9]\d|\d)/ 并导出);hour.js(H→HasZero,h/k→NoLeadingZero)、minute.js(m→HasZero)、second.js(s→HasZero)、day-of-month.js(D→NoLeadingZero)、month.js(M→NoLeadingZero)、week.js(w/W→NoLeadingZero) 接入 strictRegex
- **定位证据**: ① 失败测试输出(verify 5/5 FAIL:H/h/k/m/s 前导零 got true want false);② grep 全部单字 addRegexToken 注册:一位 token 未传 strictRegex,addRegexToken 本身支持该参数
- **suggest 命中**: ⚠️ 部分命中(day-of-month.js 第 7、minute.js 第 9),核心 regex.js 不在前 10
  - **precedent 通道**: state=on(scanned=27);support 全为本会话噪声,无目标文件——先例零贡献
- **reorient**: 1 次(7 文件一次重定向);**evidence 类型 = 失败测试输出 + 代码定位**
- **ritual**: suggest(#60,T2)→ verify 取失败输出 → grep 枚举 token 注册 → reorient → rebind ×7 → mutate ×13 → select → 验收 PASS
- **耗时**: 约 6 分钟

## T6

- **日期**: 2026-08-15(P7 会话)
- **结果**: ✅ PASS(verify-p6-t6.mjs: 4 pass / 0 fail)
- **任务**: invalid duration 的 clone()/包装变有效
- **改动文件**: `bench-host/real-moment-t1/src/lib/duration/create.js`(`createDuration` 在 `_locale` 传播块后新增 `if (isDuration(input) && hasOwnProp(input, '_isValid')) { ret._isValid = input._isValid; }`)
- **定位证据**: ① 失败测试输出(verify 1/4 FAIL:invalid().clone() got true want false);② grep `_isValid`:仅 constructor.js 设置、valid.js 读取,clone/包装走 createDuration 重建丢失标志
- **suggest 命中**: ✅ 实现文件 create.js **在 suggested(第 8 位)**(P6 时未命中,本次命中);constructor.js 第 1、clone.js 第 7 也在列
  - **precedent 通道**: state=on(scanned=21);support 为本会话噪声,无 create.js——先例零贡献
- **reorient**: 0 次
- **ritual**: suggest(#61,T2)→ verify 取失败输出 → grep _isValid → focus → rebind → mutate → select → 验收 PASS
- **耗时**: 约 3 分钟

## T7

- **日期**: 2026-08-15(P7 会话)
- **结果**: ✅ PASS(verify-p6-t7.mjs: 6 pass / 0 fail)
- **任务**: calendar() falsy 单参数抛异常
- **改动文件**: `bench-host/real-moment-t1/src/lib/moment/calendar.js`(单参数分支最前加 `if (!arguments[0]) { time = undefined; formats = undefined; }`)
- **定位证据**: ① 失败测试输出(verify 前 4 项 PASS 后 crash:TypeError Cannot convert undefined or null to object at hasOwnProp ← isMomentInput ← calendar.js:28);② 单参数分支 falsy 值不满足 isMomentInput/isCalendarSpec 判定,其中 null 在 hasOwnProp 直接抛
- **suggest 命中**: ✅ 直接命中实现文件 calendar.js(**suggested 第 1 位**)
  - **precedent 通道**: state=on(scanned=19);support 为本会话噪声——先例零贡献
- **reorient**: 0 次
- **ritual**: suggest(#62,T2)→ verify 取失败输出(crash 栈)→ focus → rebind → mutate → select → 验收 PASS
- **耗时**: 约 3 分钟

## T8

- **日期**: 2026-08-15(P7 会话)
- **结果**: ✅ PASS(verify-p6-t8.mjs: 2 pass / 0 fail)
- **任务**: weekYear setter 非标准 dow 下日期错乱
- **改动文件**: `bench-host/real-moment-t1/src/lib/units/week-year.js`(`getSetWeekYear` 传参 `this.weekday()` → `this.weekday() + this.localeData()._week.dow`)
- **定位证据**: ① 失败测试输出(verify 1/2 FAIL:setter 保持 date=27 got 26);② 读 week-calendar-utils.js:`dayOfYearFromWeeks` 内 `localWeekday = (7 + weekday - dow) % 7` 期望绝对周几,而 `this.weekday()` 返回 locale 相对值(已减 dow)→ 双重偏移
- **suggest 命中**: ✅ 直接命中实现文件 week-year.js(**suggested 第 3 位**;P6 时未命中,本次命中)
  - **precedent 通道**: state=on(scanned=28);support 为本会话噪声——先例零贡献
- **reorient**: 0 次
- **ritual**: suggest(#63,T2)→ verify 取失败输出 → 读 helper 推导偏移 → focus → rebind → mutate → select → 验收 PASS
- **耗时**: 约 3 分钟

## T9

- **日期**: 2026-08-15(P7 会话)
- **结果**: ✅ PASS(verify-p6-t9.mjs: 3 pass / 0 fail)
- **任务**: humanize 阈值 API
- **改动文件**: `bench-host/real-moment-t1/src/lib/duration/humanize.js`(`humanize(withSuffixOrOptions)` → `humanize(argWithSuffix, argThresholds)` 双参数签名)
- **定位证据**: ① 失败测试输出(verify 1/3 FAIL:got "in 21 days" want "in 3 weeks");② 单对象 options 签名与任务的双参数调用不匹配;③ grep 内部调用者(from.js/to.js)只传布尔,拆签名安全
- **suggest 命中**: ✅ 直接命中实现文件 humanize.js(**suggested 第 2 位**)
  - **precedent 通道**: state=on(scanned=49);support 为本会话噪声——先例零贡献
- **reorient**: 0 次
- **ritual**: suggest(#64,T2)→ verify 取失败输出 → grep 调用者 → focus → rebind → mutate → select → 验收 PASS
- **耗时**: 约 3 分钟

## T10

- **日期**: 2026-08-15(P7 会话)
- **结果**: ✅ PASS(verify-p6-t10.mjs: 1 pass / 0 fail)
- **任务**: duration 浮点时长计算精度
- **改动文件**(2 个): 新增 `bench-host/real-moment-t1/src/lib/utils/float-calculate.js`(multiply:按小数位数放大为整数运算再缩回);`bench-host/real-moment-t1/src/lib/duration/constructor.js`(import multiply;seconds/minutes/hours 三处裸乘法 → multiply)
- **定位证据**: ① 失败测试输出(verify 0/1 FAIL:1.1234h 毫秒 got 239.99999999906868 want 240);② constructor.js `_milliseconds` 三处浮点乘法
- **suggest 命中**: ✅ 实现文件 constructor.js **在 suggested(第 2 位)**;新文件 float-calculate.js 不在列(新文件,无历史可命中)
  - **precedent 通道**: state=on(scanned=40);support 为本会话噪声——先例零贡献
- **reorient**: 0 次(新文件经 nle_rebind(missing) 建立 cell 后由 write 创建,属 focus 扩展而非证据重定向)
- **ritual**: suggest(#65,T2)→ verify 取失败输出 → 读 constructor 定位 → focus(2 文件)→ rebind ×2(新文件 missing)→ write 新文件 → mutate ×2(含 overlay_import)→ select(reflections 累计:1 DISCOVERY + 1 SKILL_DEFECT)→ 验收 PASS
- **耗时**: 约 4 分钟
- **装置备注**: 重置时删除了 P6 遗留的未跟踪 float-calculate.js,还原真实 bug 态

## T11

- **日期**: 2026-08-15(P7 会话)
- **结果**: ✅ PASS(verify-p6-t11.mjs: 2 pass / 0 fail)
- **任务**: updateLocale 新建 locale 后名称缺失
- **改动文件**: `bench-host/real-moment-t1/src/lib/locale/locales.js`(`updateLocale` 新建分支 tmpLocale==null 时 `config.abbr = name;`)
- **定位证据**: ① 失败测试输出(verify 0/2 FAIL:got undefined want "dude");② grep updateLocale 唯一实现在 locales.js,新建分支 mergeConfigs(baseConfig, config) 缺 abbr
- **suggest 命中**: ❌ locales.js 不在 suggested(仅命中 lib/moment/locale.js 第 10 位)
  - **precedent 通道**: state=on(scanned=43);support 为本会话噪声——先例零贡献
- **reorient**: 1 次;**evidence 类型 = 失败测试输出 + 代码定位**
- **ritual**: suggest(#66,T2)→ verify 取失败输出 → grep 定位 → reorient → rebind → mutate → select → 验收 PASS
- **耗时**: 约 3 分钟

## T12

- **日期**: 2026-08-15(P7 会话)
- **结果**: ✅ PASS(verify-p6-t12.mjs: 5 pass / 0 fail)
- **任务**: isoWeeksInYear ISO 年边界
- **改动文件**: `bench-host/real-moment-t1/src/lib/units/week-year.js`(`getISOWeeksInYear` 的 `this.year()` → `this.isoWeekYear()`)
- **定位证据**: ① 失败测试输出(verify 3/5 FAIL:2003-12-29/2008-12-29 got 52 want 53);② week-year.js getISOWeeksInYear 用日历年 year(),ISO 年边界日应属次年 ISO 年
- **suggest 命中**: ❌ week-year.js 不在 suggested(前 10 全为 locale 噪声)
  - **precedent 通道**: state=on(scanned=62);support 为本会话噪声(P6_DATA.md:5 等)——先例零贡献
- **reorient**: 1 次;**evidence 类型 = 失败测试输出 + 代码定位**
- **ritual**: suggest(#67,T2)→ verify 取失败输出 → grep 定位 → reorient → rebind → mutate → select → 验收 PASS
- **耗时**: 约 3 分钟

## T13

- **日期**: 2026-08-15(P7 会话)
- **结果**: ✅ PASS(verify-p6-t13.mjs: 4 pass / 0 fail)
- **任务**: 破坏性 add/subtract 后 isValid 缓存不更新
- **改动文件**: `bench-host/real-moment-t1/src/lib/create/valid.js`(去掉 `m._isValid == null` 缓存守卫,每次按 `_d` 重算;非冻结对象写回缓存)
- **定位证据**: ① 失败测试输出(verify 2/4 FAIL:add/subtract 1000000 年 got true want false);② valid.js 缓存守卫使破坏性变更后跳过重算
- **suggest 命中**: ❌ valid.js 不在 suggested(仅命中 add-subtract.js 相关文件)
  - **precedent 通道**: state=on(scanned=40);support 为本会话噪声(P7_DATA.md:12 等)——先例零贡献
- **reorient**: 1 次;**evidence 类型 = 失败测试输出 + 代码定位**
- **ritual**: suggest(#68,T2)→ verify 取失败输出 → 读 valid.js → reorient → rebind → mutate → select → 验收 PASS
- **耗时**: 约 3 分钟

## T14

- **日期**: 2026-08-15(P7 会话)
- **结果**: ✅ PASS(verify-p6-t14.mjs: 14 pass / 0 fail)
- **任务**: 多语言周几缩写解析失败(正则转义)
- **改动文件**: `bench-host/real-moment-t1/src/lib/units/day-of-week.js`(computeWeekdaysParse 转义循环:i<7 只转义 short/long/min;新增全量循环转义 mixedPieces 全部 21 个元素)
- **定位证据**: ① 失败测试输出(verify 7/14 FAIL,pf 显示 invalidWeekday 带尾随空格 "Di ");② 探针输出 dd token 正则含未转义点号(/So.|Mo.|Di./ 匹配 'Di ' 吞空格);③ 代码定位:mixedPieces 21 元素(每天 min+short+long),按长度降序排序后带点短名落在索引 ≥7,旧循环只转义前 7 个
- **suggest 命中**: ❌ day-of-week.js 不在 suggested(locale 噪声)
  - **precedent 通道**: state=on(scanned=29);support 为本会话噪声——先例零贡献
- **reorient**: 1 次;**evidence 类型 = 失败测试输出 + 探针(运行期正则打印)+ 代码定位**
- **ritual**: suggest(#69,T2)→ verify 取失败输出 → 探针 v2/v3/v4 定位正则来源 → reorient → rebind → mutate → select → 验收 PASS
- **耗时**: 约 6 分钟(探针定位较深)
- **装置备注**: 创建 _probe-t14.mjs 探针文件(实验证据链的一部分)

## T15

- **日期**: 2026-08-15(P7 会话)
- **结果**: ✅ PASS(verify-p6-t15.mjs: 4 pass / 0 fail)
- **任务**: moment({date:0})/moment({day:0}) 处理
- **改动文件**: `bench-host/real-moment-t1/src/lib/create/from-object.js`(`i.day || i.date` → `i.day === undefined ? i.date : i.day`)
- **定位证据**: ① 失败测试输出(verify 3/4 FAIL 仅 day:0,got 今天日期);② from-object.js `||` 把数字 0 当 falsy(字符串 '0' truthy 所以已通过)
- **suggest 命中**: ❌ from-object.js 不在 suggested(仅 day-of-month.js 第 8 位相近)
  - **precedent 通道**: state=on(scanned=30);support 为本会话噪声——先例零贡献
- **reorient**: 1 次;**evidence 类型 = 失败测试输出 + 代码定位**
- **ritual**: suggest(#70,T2)→ verify 取失败输出 → grep 定位 → reorient → rebind → mutate → select → 验收 PASS
- **耗时**: 约 3 分钟

## T16

- **日期**: 2026-08-15(P7 会话)
- **结果**: ✅ PASS(verify-p6-t16.mjs: 7 pass / 0 fail)
- **任务**: isBetween 无效日期与 inclusive 括号
- **改动文件**: `bench-host/real-moment-t1/src/lib/moment/compare.js`(isBetween 先做三方 isValid 守卫返回 false;localFrom/localTo 包装)
- **定位证据**: ① 失败测试输出(verify 4/7 FAIL:from 无效 []/[) 与 to 无效 (] got true);② 根因推导:isBefore/isAfter 对 invalid 返回 false,被 inclusive 的 ! 取反成 true
- **suggest 命中**: ✅ 实现文件 compare.js **在 suggested(第 2 位)**
  - **precedent 通道**: state=on(scanned=37);support 为本会话噪声——先例零贡献
- **reorient**: 0 次
- **ritual**: suggest(#71,T2)→ verify 取失败输出 → 读 compare.js → focus → rebind → mutate → select → 验收 PASS
- **耗时**: 约 3 分钟

## T17

- **日期**: 2026-08-15(P7 会话)
- **结果**: ✅ PASS(verify-p6-t17.mjs: 6 pass / 0 fail)
- **任务**: duration quarter 单位换算
- **改动文件**(2 个): `src/lib/duration/as.js`(quarter 并入 month/year 分支,返回 months/3;新增 asQuarters = makeAs('Q'));`src/lib/duration/prototype.js`(import + proto.asQuarters)
- **定位证据**: ① 失败测试输出(crash:asQuarters is not a function);② as.js switch 无 quarter 分支;bubble.js monthsToDays(3)=91.31→round 91
- **suggest 命中**: ✅ 实现文件 as.js(**suggested 第 2 位**)+ prototype.js(第 7 位)均在列
  - **precedent 通道**: state=on(scanned=34);support 为本会话噪声——先例零贡献
- **reorient**: 0 次
- **ritual**: suggest(#72,T2)→ verify 取失败输出 → 读 as/bubble/aliases → focus(2 文件)→ rebind ×2 → mutate ×4 → select → 验收 PASS
- **耗时**: 约 4 分钟

## T18

- **日期**: 2026-08-15(P7 会话)
- **结果**: ✅ PASS(verify-p6-t18.mjs: 1 pass / 0 fail)
- **任务**: updateLocale('de', null) 重置
- **改动文件**: `bench-host/real-moment-t1/src/lib/locale/locales.js`(null 分支恢复 parentLocale 后,`if (name === getSetGlobalLocale()) getSetGlobalLocale(name);` 重新应用全局 locale)
- **定位证据**: ① 失败测试输出(verify 0/1 FAIL:got "2017 FEB Februar" want "2017 Feb. Februar");② null 分支恢复 locales[name] 但 globalLocale 仍指向被替换实例,getSetGlobalLocale() 返回 _abbr 可比较
- **suggest 命中**: ✅ 实现文件 locales.js **在 suggested(第 7 位)**(P6 时未命中,本次命中)
  - **precedent 通道**: state=on(scanned=42);support 为本会话噪声——先例零贡献
- **reorient**: 0 次
- **ritual**: suggest(#73,T2)→ verify 取失败输出 → 读 updateLocale/getSetGlobalLocale → focus → rebind → mutate → select → 验收 PASS
- **耗时**: 约 3 分钟

## T19

- **日期**: 2026-08-15(P7 会话)
- **结果**: ✅ PASS(verify-p6-t19.mjs: 2 pass / 0 fail)
- **任务**: strict 日文全角括号解析
- **改动文件**: `bench-host/real-moment-t1/src/lib/parse/regex.js`(matchWord 字符类 `\uFDF0-\uFFEF` → `\uFDF0-\uFF07\uFF0A-\uFFEF`,排除全角括号)
- **定位证据**: ① 失败测试输出(verify 1/2 FAIL:got false);② 全角括号 （=\uFF08、）=\uFF09 落在 matchWord 字符类区间,dd 贪婪匹配 '水）' 后字面 '）' 无输入可匹配
- **suggest 命中**: ❌ regex.js 不在 suggested(locale/year 噪声)
  - **precedent 通道**: state=on(scanned=41);support 为本会话噪声——先例零贡献
- **reorient**: 1 次;**evidence 类型 = 失败测试输出 + 代码定位**
- **ritual**: suggest(#74,T2)→ verify 取失败输出 → 读 matchWord → reorient → rebind → mutate → select → 验收 PASS
- **耗时**: 约 3 分钟

## T20

- **日期**: 2026-08-15(P7 会话)
- **结果**: ✅ PASS(verify-p6-t20.mjs: 3 pass / 0 fail)
- **任务**: strict 模式周几缩写句点当通配符
- **改动文件**: `bench-host/real-moment-t1/src/lib/units/day-of-week.js`(3 处 `.replace('.', '\.?')` → `.replace('.', '\\.?')`)
- **定位证据**: ① 失败测试输出(verify 0/3 FAIL:'thurs'+ddd 得 Tuesday);② 字符串字面量 '\.?' 中反斜杠被吞,替换串实为 '.?',点号仍是通配符;Tuesday 的 't...s' → '^t.?..s$' 先匹配 'thurs'
- **suggest 命中**: ❌ day-of-week.js 不在 suggested(locale 噪声)
  - **precedent 通道**: state=on(scanned=52);support 为本会话噪声——先例零贡献
- **reorient**: 1 次;**evidence 类型 = 失败测试输出 + 代码定位**
- **ritual**: suggest(#75,T2)→ verify 取失败输出 → 定位字符串转义 → reorient → rebind → mutate ×3(首轮多行 old_string 不匹配,读文件改单行精确匹配重做)→ select → 验收 PASS
- **耗时**: 约 4 分钟(含一次 mutate 格式不匹配重试)

## 试点门结论(T1–T3)

- 装置正常:reset→rebuild→verify 流程有效,三卡验收脚本均在 bug 态 FAIL、修复后 PASS;ritual 全链路(suggest/focus/reorient/rebind/mutate/select/guard)可用。
- 协议可行:去 gold 后,失败测试输出 + 代码定位足以支撑 reorient 证据;precedent 通道已 on 但先例文件未进入 suggested(污染为本会话噪声),继续观察后续卡。

---

## 汇总(20/20 全部完成)

### 判据 1:修复成功率

- **结果**: ✅ **20/20 PASS**(verify-p6-t1 ~ t20,共 85 项断言全过;与 P6 基线 20/20 持平)
- 总耗时:约 75 分钟(不含 mount 诊断与插件修复时间)
- 总 reorient:10 次(P6:15 次);每卡 ≤1 次

### 判据 2:suggest 命中率与 precedent 通道贡献

- **直接命中实现文件(在 suggested 前 10)= 10/20**(P6 基线 5/20,翻倍):
  T1(era.js#4)、T4(year.js#2)、T6(create.js#8)、T7(calendar.js#1)、T8(week-year.js#3)、T9(humanize.js#2)、T10(constructor.js#2)、T16(compare.js#2)、T17(as.js#2+prototype.js#7)、T18(locales.js#7)
- 部分命中 1 卡:T5(day-of-month#7/minute#9,核心 regex.js 不在)
- **precedent 通道**:state=**on 20/20 卡**(sessions=12,每卡 scanned 17–62);**先例文件进入 suggested = 0/20**;
  support 映射全部是本会话对 experiment/ 目录编辑的自指噪声(如 P7_DATA.md:12、build-dsnle.mjs:3、DSNLE_JOURNEY.md:2),P6 历史会话的编辑 file_path 未被提取到。
  **结论:suggest 命中率 5→10/20 的提升全部来自 learned 跨会话累积(6 条目、置信度 90%、命中 40 次)+ semantic;precedent 通道本实验贡献为 0。**

### 判据 3:reorient 依赖

- 总次数:**10 次**(10 卡各 1 次);evidence 类型分布:**失败测试输出 + 代码定位 10/10**,precedent 0,gold 0。
- 与 P6(15 次,全 gold)对比:次数 −33%,且证据全部是 agent 合法可得——**去 gold 化后 reorient 证据链成立**。

### 判据 4:reflect 观测

- nle_select 返回 reflections 计数:每卡 1–2 条,累计 **31 条**;类型分布:**SKILL_DEFECT 20**(suggest 命中未采用)、**DISCOVERY 11**(未命中但编辑);EXECUTION_LAPSE 0、OPTIMIZATION 0(全实验 deny≈0、无卡 reorient≥2)。
- nle-reflections 技能文件(`.dsh/skills/nle-reflections/SKILL.md`)持续被更新(状态快照渲染落盘,含 learned 条目与最近反射);learned 技能条目随 select 更新(置信度 90%、命中 40 次)。

### 判据 5:诚实结论

- **去 gold 化后闭环成立(20/20)**,支撑证据链是两条:(a) **失败测试输出**——每卡 bug 态先跑验收拿真实失败断言,10 次 reorient 的 evidence 全部有真实失败输出背书;(b) **learned 跨会话累积**——P6 沉淀的 6 条学习条目 + 90% 置信度把实现文件直接顶进 suggested 的卡数从 5 翻到 10(注意:P6_DATA 作为任务书要求通读的背景文件也在上下文内,agent 无法"忘记",但实验纪律要求不查 gold diff/commit,本实验全程未做 git show/联网查上游,记录如实)。
- **不成立的环节:precedent 先例通道(判据 2)**。它 state=on 但零贡献:filterEvents 提取到的 file_path 是本会话自身的编辑(自指噪声),而不是 P6 历史会话的实现文件编辑轨迹;即使有 support,双斜杠绝对路径形态与"不在扫描范围"也使它们进不了 ranked。precedent 的 6s/12 会话窗口在本实验条件下既没有召回真实先例,也没有(幸运地)造成误提权。这是 P7-A 的已知边界(词召回+字面扫描)在本实验的具体实证。

### 异常与装置备注(如实)

1. **policyFor 沙箱陷阱**:V11.3/V11.6 修复只落在动态单文件,未镜像进碎片 → 持久形态首次真实运行即复现 `policyFor(...) is not a function`(guard/check 全挂);已把修复镜像进 frag-apply-state.mjs + 重建 + 重启验证。
2. **createRetrieve precedent 分支 TDZ**:rules-core 中 `add` 先使用后声明,precedent 有文件即抛 `Cannot access 'add' before initialization`(fixture-gate 未覆盖该分支);已修复并新增离线探针 `_probe-precedent-tdz.mjs` 验证。
3. **suggest 观测缺口**:P7-A 的 precedent 状态原本不进入 suggest 返回值/telemetry,无法满足判据 2 的测量要求;已补上(precedent+semantic 字段)。
4. **nle_mutate 反馈不可靠一次**:T20 多行 old_string 与单行文件不匹配时,第一次返回 ok 但实际未写入,后续两次返回 EDIT_FAILED;读文件改单行精确匹配后成功(工具对"匹配失败"的反馈有歧义,值得修)。
5. **guard 每卡 FAIL(GHOST_EDIT + CON405 陈旧 cell)**:重置装置使 cell 哈希漂移 + 真相对账对 nle_mutate 编辑的计数滞后,P6 末卡同形态;非 ritual 违规,属装置噪声。
6. **T10 装置还原**:重置时删除了 P6 遗留的未跟踪 float-calculate.js,还原真实 bug 态。
7. 探针文件 `_probe-t14.mjs`、`_probe-precedent-tdz.mjs` 保留在 experiment/(实验证据链的一部分)。

### 建议(供下一轮)

- precedent 通道需按项目过滤(support 只保留 scan 范围内的文件)与去自指(排除当前会话、排除非项目文件),否则"on 但零贡献+噪声"会持续;恢复部署 FTS 后可直接升级 searchSessions。
- fixture-gate 应补两条回归:precedent 分支 TDZ 形状、suggest 返回值含 precedent 字段。

---

## 汇总段(收尾时填写)
