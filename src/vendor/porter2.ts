// @ts-nocheck
/*!
 * Porter2 (Snowball `english`) stemmer, vendored for semantic-slugger (SPEC 8.2).
 * Source: Snowball 3.2.0 `jsstemmer-3.2.0.tar.gz` (https://snowballstem.org/), files
 * `javascript/base-stemmer.js` and `javascript/english-stemmer.js`, joined into one module.
 * Changes: ES module exports replaced by the `porter2()` function at the end; the debug-only
 * `#slice_check()` (console.assert calls) removed. No change to the algorithm.
 *
 * Copyright (c) 2001, Dr Martin Porter
 * Copyright (c) 2004,2005, Richard Boulton
 * Copyright (c) 2013, Yoshiki Shibukawa
 * Copyright (c) 2006-2025, Olly Betts
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 *   1. Redistributions of source code must retain the above copyright notice,
 *      this list of conditions and the following disclaimer.
 *   2. Redistributions in binary form must reproduce the above copyright notice,
 *      this list of conditions and the following disclaimer in the documentation
 *      and/or other materials provided with the distribution.
 *   3. Neither the name of the Snowball project nor the names of its contributors
 *      may be used to endorse or promote products derived from this software
 *      without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
 * ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

class BaseStemmer {
    constructor() {
        /** @protected */
        this.current = '';
        this.c = 0;
        this.limit = 0;
        this.limit_backward = 0;
        this.bra = 0;
        this.ket = 0;
        this.af = 0;
    }

    /**
     * @param {string} value
     */
    setCurrent(value) {
        this.current = value;
        this.c = 0;
        this.limit = this.current.length;
        this.limit_backward = 0;
        this.bra = 0;
        this.ket = 0;
    }

    /**
     * @return {string}
     */
    getCurrent() {
        return this.current;
    }

    /**
     * @param {BaseStemmer} other
     */
    copy_from(other) {
        /** @protected */
        this.current          = other.current;
        this.c                = other.c;
        this.limit            = other.limit;
        this.limit_backward   = other.limit_backward;
        this.bra              = other.bra;
        this.ket              = other.ket;
    }

    /**
     * @param {Array<number>} s
     * @param {number} min
     * @param {number} max
     * @return {boolean}
     */
    in_grouping(s, min, max) {
        /** @protected */
        if (this.c >= this.limit) return false;
        let ch = this.current.charCodeAt(this.c);
        if (ch > max || ch < min) return false;
        ch -= min;
        if ((s[ch >>> 3] & (0x1 << (ch & 0x7))) === 0) return false;
        this.c++;
        return true;
    }

    /**
     * @param {Array<number>} s
     * @param {number} min
     * @param {number} max
     * @return {boolean}
     */
    go_in_grouping(s, min, max) {
        /** @protected */
        while (this.c < this.limit) {
            let ch = this.current.charCodeAt(this.c);
            if (ch > max || ch < min)
                return true;
            ch -= min;
            if ((s[ch >>> 3] & (0x1 << (ch & 0x7))) === 0)
                return true;
            this.c++;
        }
        return false;
    }

    /**
     * @param {Array<number>} s
     * @param {number} min
     * @param {number} max
     * @return {boolean}
     */
    in_grouping_b(s, min, max) {
        /** @protected */
        if (this.c <= this.limit_backward) return false;
        let ch = this.current.charCodeAt(this.c - 1);
        if (ch > max || ch < min) return false;
        ch -= min;
        if ((s[ch >>> 3] & (0x1 << (ch & 0x7))) === 0) return false;
        this.c--;
        return true;
    }

    /**
     * @param {Array<number>} s
     * @param {number} min
     * @param {number} max
     * @return {boolean}
     */
    go_in_grouping_b(s, min, max) {
        /** @protected */
        while (this.c > this.limit_backward) {
            let ch = this.current.charCodeAt(this.c - 1);
            if (ch > max || ch < min) return true;
            ch -= min;
            if ((s[ch >>> 3] & (0x1 << (ch & 0x7))) === 0) return true;
            this.c--;
        }
        return false;
    }

    /**
     * @param {Array<number>} s
     * @param {number} min
     * @param {number} max
     * @return {boolean}
     */
    out_grouping(s, min, max) {
        /** @protected */
        if (this.c >= this.limit) return false;
        let ch = this.current.charCodeAt(this.c);
        if (ch > max || ch < min) {
            this.c++;
            return true;
        }
        ch -= min;
        if ((s[ch >>> 3] & (0X1 << (ch & 0x7))) === 0) {
            this.c++;
            return true;
        }
        return false;
    }

    /**
     * @param {Array<number>} s
     * @param {number} min
     * @param {number} max
     * @return {boolean}
     */
    go_out_grouping(s, min, max) {
        /** @protected */
        while (this.c < this.limit) {
            let ch = this.current.charCodeAt(this.c);
            if (ch <= max && ch >= min) {
                ch -= min;
                if ((s[ch >>> 3] & (0X1 << (ch & 0x7))) !== 0) {
                    return true;
                }
            }
            this.c++;
        }
        return false;
    }

    /**
     * @param {Array<number>} s
     * @param {number} min
     * @param {number} max
     * @return {boolean}
     */
    out_grouping_b(s, min, max) {
        /** @protected */
        if (this.c <= this.limit_backward) return false;
        let ch = this.current.charCodeAt(this.c - 1);
        if (ch > max || ch < min) {
            this.c--;
            return true;
        }
        ch -= min;
        if ((s[ch >>> 3] & (0x1 << (ch & 0x7))) === 0) {
            this.c--;
            return true;
        }
        return false;
    }

    /**
     * @param {Array<number>} s
     * @param {number} min
     * @param {number} max
     * @return {boolean}
     */
    go_out_grouping_b(s, min, max) {
        /** @protected */
        while (this.c > this.limit_backward) {
            let ch = this.current.charCodeAt(this.c - 1);
            if (ch <= max && ch >= min) {
                ch -= min;
                if ((s[ch >>> 3] & (0x1 << (ch & 0x7))) !== 0) {
                    return true;
                }
            }
            this.c--;
        }
        return false;
    }

    /**
     * @param {string} s
     * @return {boolean}
     */
    eq_s(s) {
        /** @protected */
        if (this.limit - this.c < s.length) return false;
        if (!this.current.startsWith(s, this.c)) return false;
        this.c += s.length;
        return true;
    }

    /**
     * @param {string} s
     * @return {boolean}
     */
    eq_s_b(s) {
        /** @protected */
        if (this.c - this.limit_backward < s.length) return false;
        if (!this.current.endsWith(s, this.c)) return false;
        this.c -= s.length;
        return true;
    }

    /**
     * @param {Array<Array<string|number>>} v
     * @param {function(): boolean} [call_among_func]
     * @return {number}
     */
    find_among(v, call_among_func) {
        /** @protected */
        let i = 0;
        let j = v.length;

        const c = this.c;
        const l = this.limit;

        let common_i = 0;
        let common_j = 0;

        let first_key_inspected = false;

        while (true) {
            const k = i + ((j - i) >>> 1);
            let diff = 0;
            let common = common_i < common_j ? common_i : common_j; // smaller
            // w[0]: string, w[1]: result, w[2]: substring_i (optional), w[3]: function (optional)
            const w = v[k];
            const s = /**@type{string}*/ (w[0]);
            for (let i2 = common; i2 < s.length; i2++) {
                if (c + common === l) {
                    diff = -1;
                    break;
                }
                diff = this.current.charCodeAt(c + common) - s.charCodeAt(i2);
                if (diff !== 0) break;
                common++;
            }
            if (diff < 0) {
                j = k;
                common_j = common;
            } else {
                i = k;
                common_i = common;
            }
            if (j - i <= 1) {
                if (i > 0) break; // v->s has been inspected
                if (j === i) break; // only one item in v

                // - but now we need to go round once more to get
                // v->s inspected. This looks messy, but is actually
                // the optimal approach.

                if (first_key_inspected) break;
                first_key_inspected = true;
            }
        }
        while (true) {
            const w = v[i];
            const len = /**@type {string}*/ (w[0]).length;
            if (common_i >= len) {
                this.c = c + len;
                if (w.length < 4) return /**@type {number}*/ (w[1]);
                this.af = /**@type {number}*/ (w[3]);
                // @ts-expect-error: call_among_func never null here.
                if (call_among_func.call(this)) {
                    this.c = c + len;
                    return /**@type {number}*/ (w[1]);
                }
            }
            // Tests for undefined (if w.length < 2) or 0.
            if (!w[2]) return 0;
            i -= /**@type {number}*/ (w[2]);
        }
    }

    // find_among_b is for backwards processing. Same comments apply
    /**
     * @param {Array<Array<string|number>>} v
     * @param {function(): boolean} [call_among_func]
     * @return {number}
     */
    find_among_b(v, call_among_func) {
        /** @protected */
        let i = 0;
        let j = v.length

        const c = this.c;
        const lb = this.limit_backward;

        let common_i = 0;
        let common_j = 0;

        let first_key_inspected = false;

        while (true) {
            const k = i + ((j - i) >> 1);
            let diff = 0;
            let common = common_i < common_j ? common_i : common_j;
            const w = v[k];
            const s = /**@type{string}*/ (w[0]);
            for (let i2 = s.length - 1 - common; i2 >= 0; i2--) {
                if (c - common === lb) {
                    diff = -1;
                    break;
                }
                diff = this.current.charCodeAt(c - 1 - common) - s.charCodeAt(i2);
                if (diff !== 0) break;
                common++;
            }
            if (diff < 0) {
                j = k;
                common_j = common;
            } else {
                i = k;
                common_i = common;
            }
            if (j - i <= 1) {
                if (i > 0) break;
                if (j === i) break;
                if (first_key_inspected) break;
                first_key_inspected = true;
            }
        }
        while (true) {
            const w = v[i];
            const len = /**@type {string}*/ (w[0]).length;
            if (common_i >= len) {
                this.c = c - len;
                if (w.length < 4) return /**@type {number}*/ (w[1]);
                this.af = /**@type {number}*/ (w[3]);
                // @ts-expect-error: call_among_func never null here.
                if (call_among_func.call(this)) {
                    this.c = c - len;
                    return /**@type {number}*/ (w[1]);
                }
            }
            // Tests for undefined (if w.length < 2) or 0.
            if (!w[2]) return 0;
            i -= /**@type {number}*/ (w[2]);
        }
    }

    /* to replace chars between c_bra and c_ket in this.current by the
     * chars in s.
     */
    /**
     * @param {number} c_bra
     * @param {number} c_ket
     * @param {string} s
     * @return {number}
     */
    #replace_s(c_bra, c_ket, s) {
        const adjustment = s.length - (c_ket - c_bra);
        this.current = this.current.slice(0, c_bra) + s + this.current.slice(c_ket);
        this.limit += adjustment;
        if (this.c >= c_ket) this.c += adjustment;
        else if (this.c > c_bra) this.c = c_bra;
        return adjustment;
    }

    /**
     * @param {string} s
     */
    slice_from(s) {
        /** @protected */
        this.#replace_s(this.bra, this.ket, s);
        this.ket = this.bra + s.length;
    }

    /**
     */
    slice_del() {
        /** @protected */
        this.slice_from("");
    }

    /**
     * @param {number} c_bra
     * @param {number} c_ket
     * @param {string} s
     */
    insert(c_bra, c_ket, s) {
        /** @protected */
        const adjustment = this.#replace_s(c_bra, c_ket, s);
        if (c_bra <= this.bra) this.bra += adjustment;
        if (c_bra <= this.ket) this.ket += adjustment;
    }

    /**
     * @return {string}
     */
    slice_to() {
        /** @protected */
        return this.current.slice(this.bra, this.ket);
    }
}

// Generated from english.sbl by Snowball 3.2.0 - https://snowballstem.org/

// deno-lint-ignore-file ban-unused-ignore no-constant-condition no-empty prefer-const

const a_0 = [
    ["arsen", -1],
    ["commun", -1],
    ["emerg", -1],
    ["gener", -1],
    ["inter", -1],
    ["later", -1],
    ["organ", -1],
    ["past", -1],
    ["univers", -1]
];

const a_1 = [
    ["'", 1],
    ["'s'", 1, 1],
    ["'s", 1]
];

const a_2 = [
    ["ied", 2],
    ["s", 3],
    ["ies", 2, 1],
    ["sses", 1, 2],
    ["ss", -1, 3],
    ["us", -1, 4]
];

const a_3 = [
    ["succ", 1],
    ["proc", 1],
    ["exc", 1]
];

const a_4 = [
    ["even", 2],
    ["cann", 2],
    ["inn", 2],
    ["earr", 2],
    ["herr", 2],
    ["out", 2],
    ["y", 1]
];

const a_5 = [
    ["", -1],
    ["ed", 2, 1],
    ["eed", 1, 1],
    ["ing", 3, 3],
    ["edly", 2, 4],
    ["eedly", 1, 1],
    ["ingly", 2, 6]
];

const a_6 = [
    ["", 3],
    ["bb", 2, 1],
    ["dd", 2, 2],
    ["ff", 2, 3],
    ["gg", 2, 4],
    ["bl", 1, 5],
    ["mm", 2, 6],
    ["nn", 2, 7],
    ["pp", 2, 8],
    ["rr", 2, 9],
    ["at", 1, 10],
    ["tt", 2, 11],
    ["iz", 1, 12]
];

const a_7 = [
    ["anci", 3],
    ["enci", 2],
    ["ogi", 14],
    ["li", 16],
    ["bli", 12, 1],
    ["abli", 4, 1],
    ["alli", 8, 3],
    ["fulli", 9, 4],
    ["lessli", 15, 5],
    ["ousli", 10, 6],
    ["entli", 5, 7],
    ["aliti", 8],
    ["biliti", 12],
    ["iviti", 11],
    ["tional", 1],
    ["ational", 7, 1],
    ["alism", 8],
    ["ation", 7],
    ["ization", 6, 1],
    ["izer", 6],
    ["ator", 7],
    ["iveness", 11],
    ["fulness", 9],
    ["ousness", 10],
    ["ogist", 13]
];

const a_8 = [
    ["icate", 4],
    ["ative", 6],
    ["alize", 3],
    ["iciti", 4],
    ["ical", 4],
    ["tional", 1],
    ["ational", 2, 1],
    ["ful", 5],
    ["ness", 5]
];

const a_9 = [
    ["ic", 1],
    ["ance", 1],
    ["ence", 1],
    ["able", 1],
    ["ible", 1],
    ["ate", 1],
    ["ive", 1],
    ["ize", 1],
    ["iti", 1],
    ["al", 1],
    ["ism", 1],
    ["ion", 2],
    ["er", 1],
    ["ous", 1],
    ["ant", 1],
    ["ent", 1],
    ["ment", 1, 1],
    ["ement", 1, 1]
];

const a_10 = [
    ["e", 1],
    ["l", 2]
];

const a_11 = [
    ["andes", -1],
    ["atlas", -1],
    ["bias", -1],
    ["cosmos", -1],
    ["early", 6],
    ["gently", 4],
    ["howe", -1],
    ["idly", 3],
    ["news", -1],
    ["only", 7],
    ["singly", 8],
    ["skies", 2],
    ["skis", 1],
    ["sky", -1],
    ["ugly", 5]
];

const /**@type {Array<string>}*/ as_11 = ["ski", "sky", "idl", "gentl", "ugli", "earli", "onli", "singl"];

const /**@type {Array<number>}*/ g_aeo = [17, 64];

const /**@type {Array<number>}*/ g_v = [17, 65, 16, 1];

const /**@type {Array<number>}*/ g_v_WXY = [1, 17, 65, 208, 1];

const /**@type {Array<number>}*/ g_valid_LI = [55, 141, 2];


class EnglishStemmer extends BaseStemmer {


    /** @return {boolean} */
    #r_shortv() {
        // deno-lint-ignore no-unused-labels
        lab0: {
            const /**@type {number}*/ v_1 = this.limit - this.c;
            // deno-lint-ignore no-unused-labels
            lab1: {
                if (!(this.out_grouping_b(g_v_WXY, 89, 121))) break lab1;
                if (!(this.in_grouping_b(g_v, 97, 121))) break lab1;
                if (!(this.out_grouping_b(g_v, 97, 121))) break lab1;
                break lab0;
            }
            this.c = this.limit - v_1;
            // deno-lint-ignore no-unused-labels
            lab2: {
                if (!(this.out_grouping_b(g_v, 97, 121))) break lab2;
                if (!(this.in_grouping_b(g_v, 97, 121))) break lab2;
                if (/**@type {boolean}*/(this.c > this.limit_backward)) break lab2;
                break lab0;
            }
            this.c = this.limit - v_1;
            if (!(this.eq_s_b("past"))) return false;
        }
        return true;
    }

    /** @return {boolean} */
    #stem() {
        let /**@type {number}*/ a;
        let /**@type {boolean}*/ B_Y_found;
        let /**@type {number}*/ I_p2;
        let /**@type {number}*/ I_p1;
        // deno-lint-ignore no-unused-labels
        lab0: {
            const /**@type {number}*/ v_1 = this.c;
            // deno-lint-ignore no-unused-labels
            lab1: {
                this.bra = this.c;
                a = this.find_among(a_11);
                if (a === 0) break lab1;
                this.ket = this.c;
                if (/**@type {boolean}*/(this.c < this.limit)) break lab1;
                if (a > 0) {
                    this.slice_from(as_11[a - 1]);
                }
                break lab0;
            }
            this.c = v_1;
            // deno-lint-ignore no-unused-labels
            lab2: {
                // deno-lint-ignore no-unused-labels
                lab3: {
                    if (this.c + 3 > this.limit) break lab3;
                    this.c += 3;
                    break lab2;
                }
                break lab0;
            }
            this.c = v_1;
            // deno-lint-ignore no-unused-labels
            lab4: {
                B_Y_found = false;
                const /**@type {number}*/ v_2 = this.c;
                // deno-lint-ignore no-unused-labels
                lab5: {
                    this.bra = this.c;
                    if (!(this.eq_s("'"))) break lab5;
                    this.ket = this.c;
                    this.slice_del();
                }
                this.c = v_2;
                const /**@type {number}*/ v_3 = this.c;
                // deno-lint-ignore no-unused-labels
                lab6: {
                    this.bra = this.c;
                    if (!(this.eq_s("y"))) break lab6;
                    this.ket = this.c;
                    this.slice_from("Y");
                    B_Y_found = true;
                }
                this.c = v_3;
                const /**@type {number}*/ v_4 = this.c;
                // deno-lint-ignore no-unused-labels
                lab7: {
                    while (true) {
                        const /**@type {number}*/ v_5 = this.c;
                        // deno-lint-ignore no-unused-labels
                        lab8: {
                            // deno-lint-ignore no-unused-labels
                            golab9: while (true)
                            {
                                const /**@type {number}*/ v_6 = this.c;
                                // deno-lint-ignore no-unused-labels
                                lab10: {
                                    if (!(this.in_grouping(g_v, 97, 121))) break lab10;
                                    this.bra = this.c;
                                    if (!(this.eq_s("y"))) break lab10;
                                    this.ket = this.c;
                                    this.c = v_6;
                                    break golab9;
                                }
                                this.c = v_6;
                                if (this.c >= this.limit) break lab8;
                                this.c++;
                            }
                            this.slice_from("Y");
                            B_Y_found = true;
                            continue;
                        }
                        this.c = v_5;
                        break;
                    }
                }
                this.c = v_4;
            }
            // deno-lint-ignore no-unused-labels
            lab11: {
                I_p1 = this.limit;
                I_p2 = this.limit;
                const /**@type {number}*/ v_7 = this.c;
                // deno-lint-ignore no-unused-labels
                lab12: {
                    // deno-lint-ignore no-unused-labels
                    lab13: {
                        const /**@type {number}*/ v_8 = this.c;
                        // deno-lint-ignore no-unused-labels
                        lab14: {
                            if (this.find_among(a_0) === 0) break lab14;
                            break lab13;
                        }
                        this.c = v_8;
                        if (!this.go_out_grouping(g_v, 97, 121)) break lab12;
                        this.c++;
                        if (!this.go_in_grouping(g_v, 97, 121)) break lab12;
                        this.c++;
                    }
                    I_p1 = this.c;
                    if (!this.go_out_grouping(g_v, 97, 121)) break lab12;
                    this.c++;
                    if (!this.go_in_grouping(g_v, 97, 121)) break lab12;
                    this.c++;
                    I_p2 = this.c;
                }
                this.c = v_7;
            }
            this.limit_backward = this.c; this.c = this.limit;
            const /**@type {number}*/ v_9 = this.limit - this.c;
            // deno-lint-ignore no-unused-labels
            lab15: {
                const /**@type {number}*/ v_10 = this.limit - this.c;
                // deno-lint-ignore no-unused-labels
                lab16: {
                    this.ket = this.c;
                    if (this.find_among_b(a_1) === 0) {
                        this.c = this.limit - v_10;
                        break lab16;
                    }
                    this.bra = this.c;
                    this.slice_del();
                }
                this.ket = this.c;
                a = this.find_among_b(a_2);
                if (a === 0) break lab15;
                this.bra = this.c;
                switch (a) {
                    case 1: {
                        this.slice_from("ss");
                        break;
                    }
                    case 2: {
                        // deno-lint-ignore no-unused-labels
                        lab17: {
                            const /**@type {number}*/ v_11 = this.limit - this.c;
                            // deno-lint-ignore no-unused-labels
                            lab18: {
                                if (this.c - 2 < this.limit_backward) break lab18;
                                this.c -= 2;
                                this.slice_from("i");
                                break lab17;
                            }
                            this.c = this.limit - v_11;
                            this.slice_from("ie");
                        }
                        break;
                    }
                    case 3: {
                        if (this.c <= this.limit_backward) break lab15;
                        this.c--;
                        if (!this.go_out_grouping_b(g_v, 97, 121)) break lab15;
                        this.c--;
                        this.slice_del();
                        break;
                    }
                }
            }
            this.c = this.limit - v_9;
            const /**@type {number}*/ v_12 = this.limit - this.c;
            // deno-lint-ignore no-unused-labels
            lab19: {
                this.ket = this.c;
                a = this.find_among_b(a_5);
                this.bra = this.c;
                // deno-lint-ignore no-unused-labels
                lab20: {
                    const /**@type {number}*/ v_13 = this.limit - this.c;
                    // deno-lint-ignore no-unused-labels
                    lab21: {
                        switch (a) {
                            case 1: {
                                const /**@type {number}*/ v_14 = this.limit - this.c;
                                // deno-lint-ignore no-unused-labels
                                lab22: {
                                    if (/**@type {boolean}*/(I_p1 > this.c)) break lab22;
                                    // deno-lint-ignore no-unused-labels
                                    lab23: {
                                        const /**@type {number}*/ v_15 = this.limit - this.c;
                                        // deno-lint-ignore no-unused-labels
                                        lab24: {
                                            if (this.find_among_b(a_3) === 0) break lab24;
                                            if (/**@type {boolean}*/(this.c > this.limit_backward)) break lab24;
                                            break lab23;
                                        }
                                        this.c = this.limit - v_15;
                                        this.slice_from("ee");
                                    }
                                }
                                this.c = this.limit - v_14;
                                break;
                            }
                            case 2: {
                                break lab21;
                            }
                            case 3: {
                                a = this.find_among_b(a_4);
                                if (a === 0) break lab21;
                                switch (a) {
                                    case 1: {
                                        const /**@type {number}*/ v_16 = this.limit - this.c;
                                        if (!(this.out_grouping_b(g_v, 97, 121))) break lab21;
                                        if (/**@type {boolean}*/(this.c > this.limit_backward)) break lab21;
                                        this.c = this.limit - v_16;
                                        this.bra = this.c;
                                        this.slice_from("ie");
                                        break;
                                    }
                                    case 2: {
                                        if (/**@type {boolean}*/(this.c > this.limit_backward)) break lab21;
                                        break;
                                    }
                                }
                                break;
                            }
                        }
                        break lab20;
                    }
                    this.c = this.limit - v_13;
                    const /**@type {number}*/ v_17 = this.limit - this.c;
                    if (!this.go_out_grouping_b(g_v, 97, 121)) break lab19;
                    this.c--;
                    this.c = this.limit - v_17;
                    this.slice_del();
                    this.ket = this.c;
                    this.bra = this.c;
                    const /**@type {number}*/ v_18 = this.limit - this.c;
                    a = this.find_among_b(a_6);
                    switch (a) {
                        case 1: {
                            this.slice_from("e");
                            break lab19;
                        }
                        case 2: {
                            {
                                const /**@type {number}*/ v_19 = this.limit - this.c;
                                // deno-lint-ignore no-unused-labels
                                lab25: {
                                    if (!(this.in_grouping_b(g_aeo, 97, 111))) break lab25;
                                    if (/**@type {boolean}*/(this.c > this.limit_backward)) break lab25;
                                    break lab19;
                                }
                                this.c = this.limit - v_19;
                            }
                            break;
                        }
                        case 3: {
                            if (/**@type {boolean}*/(this.c !== I_p1)) break lab19;
                            const /**@type {number}*/ v_20 = this.limit - this.c;
                            if (!this.#r_shortv()) break lab19;
                            this.c = this.limit - v_20;
                            this.slice_from("e");
                            break lab19;
                        }
                    }
                    this.c = this.limit - v_18;
                    this.ket = this.c;
                    if (this.c <= this.limit_backward) break lab19;
                    this.c--;
                    this.bra = this.c;
                    this.slice_del();
                }
            }
            this.c = this.limit - v_12;
            const /**@type {number}*/ v_21 = this.limit - this.c;
            // deno-lint-ignore no-unused-labels
            lab26: {
                this.ket = this.c;
                // deno-lint-ignore no-unused-labels
                lab27: {
                    // deno-lint-ignore no-unused-labels
                    lab28: {
                        if (!(this.eq_s_b("y"))) break lab28;
                        break lab27;
                    }
                    if (!(this.eq_s_b("Y"))) break lab26;
                }
                this.bra = this.c;
                if (!(this.out_grouping_b(g_v, 97, 121))) break lab26;
                if (/**@type {boolean}*/(this.c <= this.limit_backward)) break lab26;
                this.slice_from("i");
            }
            this.c = this.limit - v_21;
            const /**@type {number}*/ v_22 = this.limit - this.c;
            // deno-lint-ignore no-unused-labels
            lab29: {
                this.ket = this.c;
                a = this.find_among_b(a_7);
                if (a === 0) break lab29;
                this.bra = this.c;
                if (/**@type {boolean}*/(I_p1 > this.c)) break lab29;
                switch (a) {
                    case 1: {
                        this.slice_from("tion");
                        break;
                    }
                    case 2: {
                        this.slice_from("ence");
                        break;
                    }
                    case 3: {
                        this.slice_from("ance");
                        break;
                    }
                    case 4: {
                        this.slice_from("able");
                        break;
                    }
                    case 5: {
                        this.slice_from("ent");
                        break;
                    }
                    case 6: {
                        this.slice_from("ize");
                        break;
                    }
                    case 7: {
                        this.slice_from("ate");
                        break;
                    }
                    case 8: {
                        this.slice_from("al");
                        break;
                    }
                    case 9: {
                        this.slice_from("ful");
                        break;
                    }
                    case 10: {
                        this.slice_from("ous");
                        break;
                    }
                    case 11: {
                        this.slice_from("ive");
                        break;
                    }
                    case 12: {
                        this.slice_from("ble");
                        break;
                    }
                    case 13: {
                        this.slice_from("og");
                        break;
                    }
                    case 14: {
                        if (!(this.eq_s_b("l"))) break lab29;
                        this.slice_from("og");
                        break;
                    }
                    case 15: {
                        this.slice_from("less");
                        break;
                    }
                    case 16: {
                        if (!(this.in_grouping_b(g_valid_LI, 99, 116))) break lab29;
                        this.slice_del();
                        break;
                    }
                }
            }
            this.c = this.limit - v_22;
            const /**@type {number}*/ v_23 = this.limit - this.c;
            // deno-lint-ignore no-unused-labels
            lab30: {
                this.ket = this.c;
                a = this.find_among_b(a_8);
                if (a === 0) break lab30;
                this.bra = this.c;
                if (/**@type {boolean}*/(I_p1 > this.c)) break lab30;
                switch (a) {
                    case 1: {
                        this.slice_from("tion");
                        break;
                    }
                    case 2: {
                        this.slice_from("ate");
                        break;
                    }
                    case 3: {
                        this.slice_from("al");
                        break;
                    }
                    case 4: {
                        this.slice_from("ic");
                        break;
                    }
                    case 5: {
                        this.slice_del();
                        break;
                    }
                    case 6: {
                        if (/**@type {boolean}*/(I_p2 > this.c)) break lab30;
                        this.slice_del();
                        break;
                    }
                }
            }
            this.c = this.limit - v_23;
            const /**@type {number}*/ v_24 = this.limit - this.c;
            // deno-lint-ignore no-unused-labels
            lab31: {
                this.ket = this.c;
                a = this.find_among_b(a_9);
                if (a === 0) break lab31;
                this.bra = this.c;
                if (/**@type {boolean}*/(I_p2 > this.c)) break lab31;
                switch (a) {
                    case 1: {
                        this.slice_del();
                        break;
                    }
                    case 2: {
                        // deno-lint-ignore no-unused-labels
                        lab32: {
                            // deno-lint-ignore no-unused-labels
                            lab33: {
                                if (!(this.eq_s_b("s"))) break lab33;
                                break lab32;
                            }
                            if (!(this.eq_s_b("t"))) break lab31;
                        }
                        this.slice_del();
                        break;
                    }
                }
            }
            this.c = this.limit - v_24;
            const /**@type {number}*/ v_25 = this.limit - this.c;
            // deno-lint-ignore no-unused-labels
            lab34: {
                this.ket = this.c;
                a = this.find_among_b(a_10);
                if (a === 0) break lab34;
                this.bra = this.c;
                switch (a) {
                    case 1: {
                        // deno-lint-ignore no-unused-labels
                        lab35: {
                            // deno-lint-ignore no-unused-labels
                            lab36: {
                                if (/**@type {boolean}*/(I_p2 > this.c)) break lab36;
                                break lab35;
                            }
                            if (/**@type {boolean}*/(I_p1 > this.c)) break lab34;
                            {
                                const /**@type {number}*/ v_26 = this.limit - this.c;
                                // deno-lint-ignore no-unused-labels
                                lab37: {
                                    if (!this.#r_shortv()) break lab37;
                                    break lab34;
                                }
                                this.c = this.limit - v_26;
                            }
                        }
                        this.slice_del();
                        break;
                    }
                    case 2: {
                        if (/**@type {boolean}*/(I_p2 > this.c)) break lab34;
                        if (!(this.eq_s_b("l"))) break lab34;
                        this.slice_del();
                        break;
                    }
                }
            }
            this.c = this.limit - v_25;
            this.c = this.limit_backward;
            const /**@type {number}*/ v_27 = this.c;
            // deno-lint-ignore no-unused-labels
            lab38: {
                if (!B_Y_found) break lab38;
                while (true) {
                    const /**@type {number}*/ v_28 = this.c;
                    // deno-lint-ignore no-unused-labels
                    lab39: {
                        // deno-lint-ignore no-unused-labels
                        golab40: while (true)
                        {
                            const /**@type {number}*/ v_29 = this.c;
                            // deno-lint-ignore no-unused-labels
                            lab41: {
                                this.bra = this.c;
                                if (!(this.eq_s("Y"))) break lab41;
                                this.ket = this.c;
                                this.c = v_29;
                                break golab40;
                            }
                            this.c = v_29;
                            if (this.c >= this.limit) break lab39;
                            this.c++;
                        }
                        this.slice_from("y");
                        continue;
                    }
                    this.c = v_28;
                    break;
                }
            }
            this.c = v_27;
        }
        return true;
    }

    /**@return{string}*/
    stem(/**@type {string}*/input) {
        this.setCurrent(input);
        this.#stem();
        return this.getCurrent();
    }

    stemWord = this.stem;
}

let instance: EnglishStemmer | undefined

/** Porter2 stem of a lower-case ascii word. Built on first use. */
export function porter2(word: string): string {
  if (instance === undefined) instance = new EnglishStemmer()
  return instance.stem(word)
}
