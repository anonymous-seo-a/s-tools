<?php
/**
 * Plugin Name: soico Behavior Beacon (PoC)
 * Description: ⑤行動層(scroll/dwell/rage/dead + セクション到達 + CTA可視) を計測する PoC ビーコン。
 *   台帳(soico-affiliate-ledger)はサーバ側のみでJS非依存だが、行動はブラウザでしか測れないため
 *   最小のクライアントJSを「PoC対象1記事だけ」に注入する。scroll/dwell が「リライト判断を変える
 *   信号」になるか検証してから全体展開する（PoC先行）。データは soico_behavior_events に蓄積。
 * Version: 0.1.0 (PoC)
 * Author: soico
 *
 * 設置: mu-plugins/。SOICO_BEHAVIOR_POC_POST_ID の記事のみ計測。全展開時はゲートを外す。
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// PoC 対象記事（1本）。全展開時はこの定数ゲートを is_singular('post') に緩める。
if ( ! defined( 'SOICO_BEHAVIOR_POC_POST_ID' ) ) {
	define( 'SOICO_BEHAVIOR_POC_POST_ID', 8178 );
}
define( 'SOICO_BEHAVIOR_TABLE', 'soico_behavior_events' );
define( 'SOICO_BEHAVIOR_DB_VERSION', '1' );

/* テーブル（行動イベント台帳） */
add_action( 'init', 'soico_behavior_maybe_install' );
function soico_behavior_maybe_install() {
	if ( get_option( 'soico_behavior_db_version' ) === SOICO_BEHAVIOR_DB_VERSION ) {
		return;
	}
	global $wpdb;
	$table   = $wpdb->prefix . SOICO_BEHAVIOR_TABLE;
	$charset = $wpdb->get_charset_collate();
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	dbDelta(
		"CREATE TABLE {$table} (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			created_at DATETIME NOT NULL,
			post_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
			ga_client_id VARCHAR(64) NOT NULL DEFAULT '',
			scroll_max_pct SMALLINT NOT NULL DEFAULT 0,
			dwell_ms INT UNSIGNED NOT NULL DEFAULT 0,
			rage SMALLINT NOT NULL DEFAULT 0,
			dead SMALLINT NOT NULL DEFAULT 0,
			cta_seen TINYINT NOT NULL DEFAULT 0,
			cta_clicked TINYINT NOT NULL DEFAULT 0,
			sections_json MEDIUMTEXT NULL,
			ua VARCHAR(255) NOT NULL DEFAULT '',
			PRIMARY KEY (id),
			KEY post_id (post_id),
			KEY created_at (created_at)
		) {$charset};"
	);
	update_option( 'soico_behavior_db_version', SOICO_BEHAVIOR_DB_VERSION );
}

/* 対象記事にだけ計測JSをフッタ注入 */
add_action( 'wp_footer', 'soico_behavior_inject', 99 );
function soico_behavior_inject() {
	if ( ! is_singular( 'post' ) ) {
		return;
	}
	$post_id = (int) get_queried_object_id();
	if ( SOICO_BEHAVIOR_POC_POST_ID && $post_id !== (int) SOICO_BEHAVIOR_POC_POST_ID ) {
		return; // PoC: 対象1記事のみ
	}
	if ( is_user_logged_in() && current_user_can( 'edit_posts' ) ) {
		return; // 編集者の閲覧は除外
	}
	$ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
	if ( '' === $ua || preg_match( '/bot|crawl|spider|slurp|bingpreview|headless|lighthouse|pagespeed|gtmetrix|monitor|preview|facebookexternalhit|embed/i', $ua ) ) {
		return; // bot / Lighthouse は計測しない
	}
	$endpoint = esc_url_raw( rest_url( 'soico/v1/behavior' ) );
	$js = soico_behavior_js( $post_id, $endpoint );
	echo "<script>{$js}</script>\n"; // phpcs:ignore
}

function soico_behavior_js( $post_id, $endpoint ) {
	$pid = (int) $post_id;
	$ep  = wp_json_encode( $endpoint );
	// 最小・非ブロッキング。sendBeacon で pagehide/hidden 時に一度だけ送信。
	return <<<JS
(function(){
"use strict";
var PID={$pid}, EP={$ep};
var lastVis=Date.now(), visMs=0, maxScroll=0, rage=0, dead=0, ctaSeen=0, ctaClicked=0, sent=false, clicks=[];
function pct(){var h=document.documentElement,b=document.body;var sh=Math.max(h.scrollHeight,b.scrollHeight)-window.innerHeight;var p=sh>0?Math.round((window.scrollY/sh)*100):100;return p<0?0:(p>100?100:p);}
window.addEventListener('scroll',function(){var p=pct();if(p>maxScroll)maxScroll=p;},{passive:true});
var heads=[].slice.call(document.querySelectorAll('.entry-content h2,.entry-content h3,article h2,article h3')).slice(0,40);
var secs=heads.map(function(el,i){return {i:i,sig:(el.textContent||'').trim().slice(0,40),seen:0,ms:0,_t:0};});
if('IntersectionObserver' in window){
 var io=new IntersectionObserver(function(es){es.forEach(function(e){var idx=heads.indexOf(e.target);if(idx<0)return;var s=secs[idx];if(e.isIntersecting){s.seen=1;s._t=Date.now();}else if(s._t){s.ms+=Date.now()-s._t;s._t=0;}});},{threshold:0.5});
 heads.forEach(function(el){io.observe(el);});
 var ctas=[].slice.call(document.querySelectorAll('a[href*="/recommends/"]'));
 if(ctas.length){var cio=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)ctaSeen=1;});},{threshold:0.5});ctas.forEach(function(el){cio.observe(el);el.addEventListener('click',function(){ctaClicked=1;});});}
}
document.addEventListener('click',function(e){var now=Date.now();clicks.push({t:now,x:e.clientX,y:e.clientY});clicks=clicks.filter(function(c){return now-c.t<800;});var near=clicks.filter(function(c){return Math.abs(c.x-e.clientX)<32&&Math.abs(c.y-e.clientY)<32;});if(near.length>=3)rage++;var t=e.target;var inter=t&&t.closest?t.closest('a,button,input,select,textarea,label,summary,[role=button],[onclick]'):null;if(!inter)dead++;},true);
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden'){visMs+=Date.now()-lastVis;flush();}else{lastVis=Date.now();}});
window.addEventListener('pagehide',flush);
function flush(){if(sent)return;sent=true;secs.forEach(function(s){if(s._t){s.ms+=Date.now()-s._t;s._t=0;}});var p={post_id:PID,scroll_max_pct:maxScroll,dwell_ms:visMs+(Date.now()-lastVis),rage:rage,dead:dead,cta_seen:ctaSeen,cta_clicked:ctaClicked,sections:secs.map(function(s){return {i:s.i,sig:s.sig,seen:s.seen,ms:Math.round(s.ms)};})};try{navigator.sendBeacon(EP,new Blob([JSON.stringify(p)],{type:'application/json'}));}catch(e){}}
})();
JS;
}

/* 受信 REST（匿名テレメトリ。PoC対象記事のみ受理） */
add_action( 'rest_api_init', 'soico_behavior_routes' );
function soico_behavior_routes() {
	register_rest_route(
		'soico/v1',
		'/behavior',
		array(
			'methods'             => 'POST',
			'permission_callback' => '__return_true', // 匿名。対象記事ゲート+クランプで防御。
			'callback'            => 'soico_behavior_ingest',
		)
	);
	register_rest_route(
		'soico/v1',
		'/behavior/summary',
		array(
			'methods'             => 'GET',
			'permission_callback' => function () { return current_user_can( 'edit_posts' ); },
			'callback'            => 'soico_behavior_summary',
		)
	);
}

function soico_behavior_ingest( WP_REST_Request $req ) {
	global $wpdb;
	$b = $req->get_json_params();
	if ( ! is_array( $b ) ) {
		return new WP_Error( 'bad', 'invalid', array( 'status' => 400 ) );
	}
	$post_id = (int) ( $b['post_id'] ?? 0 );
	// PoC: 対象記事以外は捨てる（公開エンドポイントの悪用防止）。
	if ( SOICO_BEHAVIOR_POC_POST_ID && $post_id !== (int) SOICO_BEHAVIOR_POC_POST_ID ) {
		return new WP_Error( 'scope', 'out of scope', array( 'status' => 403 ) );
	}
	$clamp = function ( $v, $min, $max ) { $v = (int) $v; return $v < $min ? $min : ( $v > $max ? $max : $v ); };
	// セクションは件数・文字数を制限して保存（自由記述のDoS/汚染防止）。
	$sections = array();
	if ( ! empty( $b['sections'] ) && is_array( $b['sections'] ) ) {
		foreach ( array_slice( $b['sections'], 0, 40 ) as $s ) {
			$sections[] = array(
				'i'    => (int) ( $s['i'] ?? 0 ),
				'sig'  => mb_substr( sanitize_text_field( (string) ( $s['sig'] ?? '' ) ), 0, 40 ),
				'seen' => empty( $s['seen'] ) ? 0 : 1,
				'ms'   => $clamp( $s['ms'] ?? 0, 0, 3600000 ),
			);
		}
	}
	$cid = '';
	if ( preg_match( '/GA\d+\.\d+\.(\d+\.\d+)/', (string) ( $_COOKIE['_ga'] ?? '' ), $m ) ) {
		$cid = $m[1];
	}
	$wpdb->insert(
		$wpdb->prefix . SOICO_BEHAVIOR_TABLE,
		array(
			'created_at'     => current_time( 'mysql' ),
			'post_id'        => $post_id,
			'ga_client_id'   => $cid,
			'scroll_max_pct' => $clamp( $b['scroll_max_pct'] ?? 0, 0, 100 ),
			'dwell_ms'       => $clamp( $b['dwell_ms'] ?? 0, 0, 3600000 ),
			'rage'           => $clamp( $b['rage'] ?? 0, 0, 1000 ),
			'dead'           => $clamp( $b['dead'] ?? 0, 0, 1000 ),
			'cta_seen'       => empty( $b['cta_seen'] ) ? 0 : 1,
			'cta_clicked'    => empty( $b['cta_clicked'] ) ? 0 : 1,
			'sections_json'  => $sections ? wp_json_encode( $sections ) : null,
			'ua'             => substr( $_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255 ),
		)
	);
	return array( 'ok' => 1 );
}

function soico_behavior_summary( WP_REST_Request $req ) {
	global $wpdb;
	$table   = $wpdb->prefix . SOICO_BEHAVIOR_TABLE;
	$post_id = (int) $req->get_param( 'post_id' );
	$where   = $post_id ? $wpdb->prepare( 'WHERE post_id = %d', $post_id ) : '';
	$agg = $wpdb->get_row( "SELECT COUNT(*) n, AVG(scroll_max_pct) scroll, AVG(dwell_ms) dwell, SUM(rage) rage, SUM(dead) dead, SUM(cta_seen) cta_seen, SUM(cta_clicked) cta_clicked FROM {$table} {$where}", ARRAY_A );
	// セクション別到達率 = 「そのセクションを seen したセッション / 全セッション」。離脱点の特定。
	$secWhere = ( '' === $where ) ? 'WHERE sections_json IS NOT NULL' : $where . ' AND sections_json IS NOT NULL';
	$rows = $wpdb->get_results( "SELECT sections_json FROM {$table} {$secWhere}", ARRAY_A );
	$secAgg = array();
	foreach ( (array) $rows as $r ) {
		$secs = json_decode( $r['sections_json'], true );
		if ( ! is_array( $secs ) ) { continue; }
		foreach ( $secs as $s ) {
			$i = (int) ( $s['i'] ?? 0 );
			if ( ! isset( $secAgg[ $i ] ) ) { $secAgg[ $i ] = array( 'i' => $i, 'sig' => (string) ( $s['sig'] ?? '' ), 'seen' => 0, 'ms' => 0, 'n' => 0 ); }
			$secAgg[ $i ]['seen'] += empty( $s['seen'] ) ? 0 : 1;
			$secAgg[ $i ]['ms']   += (int) ( $s['ms'] ?? 0 );
			$secAgg[ $i ]['n']    += 1;
		}
	}
	ksort( $secAgg );
	// スクロール深度分布（Clarity 型スクロールヒートマップ用）:
	// 各10%刻みに「そこまで到達したセッション比率」を返す（単調非増加の古典形）。
	$depths = array_map( 'intval', (array) $wpdb->get_col( "SELECT scroll_max_pct FROM {$table} {$where}" ) );
	$n_depth = count( $depths );
	$scroll_reach = array();
	for ( $d = 0; $d <= 100; $d += 10 ) {
		$c = 0;
		foreach ( $depths as $v ) {
			if ( $v >= $d ) { $c++; }
		}
		$scroll_reach[] = array( 'depth' => $d, 'ratio' => $n_depth ? round( $c / $n_depth, 3 ) : 0 );
	}
	return array(
		'post_id'  => $post_id,
		'title'    => $post_id ? (string) get_the_title( $post_id ) : '',
		'url'      => $post_id ? (string) get_permalink( $post_id ) : '',
		'sessions' => (int) ( $agg['n'] ?? 0 ),
		'scroll_max_pct_avg' => round( (float) ( $agg['scroll'] ?? 0 ), 1 ),
		'dwell_ms_avg'       => round( (float) ( $agg['dwell'] ?? 0 ) ),
		'rage'        => (int) ( $agg['rage'] ?? 0 ),
		'dead'        => (int) ( $agg['dead'] ?? 0 ),
		'cta_seen'    => (int) ( $agg['cta_seen'] ?? 0 ),
		'cta_clicked' => (int) ( $agg['cta_clicked'] ?? 0 ),
		'scroll_reach' => $scroll_reach,
		'sections'    => array_values( $secAgg ),
	);
}
