<?php
/**
 * Plugin Name: soico AIOSEO meta description REST
 * Description: リライトツールから AIOSEO の meta description を更新する認証付き REST エンドポイント。
 * Version: 1.0.0
 *
 * 配置: wp-content/mu-plugins/soico-aioseo-rest.php (mu-plugins は自動有効化)
 *
 * エンドポイント:
 *   POST /wp-json/soico/v1/aioseo-description
 *   body: { "post_id": 9008, "description": "新しいメタディスクリプション" }
 *   認証: Application Password (soico-cvr-system, edit_posts 権限)。
 *
 * 保存: AIOSEO 4.x の Post モデル (wp_aioseo_posts.description) を正規ルートで更新。
 *       モデルが使えない場合はテーブル直更新 + post meta にフォールバック。
 */

if (!defined('ABSPATH')) exit;

add_action('rest_api_init', function () {
    register_rest_route('soico/v1', '/aioseo-description', [
        'methods'  => 'POST',
        'permission_callback' => function (WP_REST_Request $req) {
            $postId = (int) $req->get_param('post_id');
            return $postId > 0 && current_user_can('edit_post', $postId);
        },
        'callback' => function (WP_REST_Request $req) {
            $postId = (int) $req->get_param('post_id');
            $desc   = (string) $req->get_param('description');
            if ($postId <= 0 || !get_post($postId)) {
                return new WP_Error('invalid_post', 'post not found', ['status' => 404]);
            }
            $desc = wp_strip_all_tags($desc);

            $saved = false;
            // 1) AIOSEO 4.x Post モデル (正規ルート)
            $modelClass = '\\AIOSEO\\Plugin\\Common\\Models\\Post';
            if (class_exists($modelClass) && method_exists($modelClass, 'getPost')) {
                try {
                    $aioseoPost = $modelClass::getPost($postId);
                    $aioseoPost->description = $desc;
                    $aioseoPost->save();
                    $saved = true;
                } catch (\Throwable $e) {
                    $saved = false;
                }
            }
            // 2) フォールバック: テーブル直更新
            if (!$saved) {
                global $wpdb;
                $table = $wpdb->prefix . 'aioseo_posts';
                $exists = $wpdb->get_var($wpdb->prepare("SELECT id FROM {$table} WHERE post_id=%d", $postId));
                if ($exists) {
                    $wpdb->update($table, ['description' => $desc, 'updated' => current_time('mysql')], ['post_id' => $postId]);
                } else {
                    $wpdb->insert($table, ['post_id' => $postId, 'description' => $desc, 'created' => current_time('mysql'), 'updated' => current_time('mysql')]);
                }
                $saved = true;
            }
            // legacy post meta も合わせて更新
            update_post_meta($postId, '_aioseo_description', $desc);

            return ['post_id' => $postId, 'description' => $desc, 'saved' => $saved];
        },
    ]);
});
