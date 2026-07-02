<?php
/**
 * Plugin Name: soico Affiliate Referer Restore
 * Description: 本文中の /recommends/（アフィリ）リンクの rel を整える。(1) noreferrer を除去し同一オリジン遷移で Referer を復活 → サーバ台帳が流入記事(post_id)を決定論的に解決し記事帰属率が上がる。(2) sponsored を自動付与 → YMYLアフィリの Google 適正化。noopener は温存（セキュリティ）。CTAブロック出力もコンテンツ展開後に処理するため動的・焼き込みの両方を一網打尽。
 * Version: 1.1.0
 * Author: soico
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_filter( 'the_content', 'soico_afr_fix_rel', 99 );
function soico_afr_fix_rel( $content ) {
	if ( ! is_string( $content ) || false === strpos( $content, '/recommends/' ) ) {
		return $content;
	}
	return preg_replace_callback( '#<a\b[^>]*>#i', 'soico_afr_fix_anchor', $content );
}

function soico_afr_fix_anchor( $m ) {
	$tag = $m[0];
	// /recommends/（自ドメインのアフィリ関所）リンク以外は一切触らない。
	if ( false === strpos( $tag, '/recommends/' ) ) {
		return $tag;
	}

	// 既存 rel があれば: noreferrer 除去 + sponsored 付与（noopener 等は温存）。
	if ( preg_match( '#\brel\s*=\s*(["\']).*?\1#i', $tag ) ) {
		return preg_replace_callback(
			'#\brel\s*=\s*(["\'])(.*?)\1#i',
			function ( $r ) {
				$tokens = array_values(
					array_filter(
						preg_split( '/\s+/', trim( $r[2] ) ),
						function ( $t ) {
							return '' !== $t && 'noreferrer' !== strtolower( $t );
						}
					)
				);
				if ( ! in_array( 'sponsored', array_map( 'strtolower', $tokens ), true ) ) {
					$tokens[] = 'sponsored';
				}
				return 'rel=' . $r[1] . implode( ' ', $tokens ) . $r[1];
			},
			$tag
		);
	}

	// rel 属性が無いアンカー → sponsored を付与。
	return preg_replace( '#<a\b#i', '<a rel="sponsored"', $tag, 1 );
}
