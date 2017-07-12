﻿   /**
    *
    *  数据格式：[{id:1,name:"ceshi", parentId:0 , children:[{..}] }]
    *
    *  支持两种形式(childrenField设置是否为空来判断是否是分级结构)
    *        1. 数据格式同级，通过 parentId（可定义） 关联
    *        2. 数据已经分级，挂载在 children（可定义） 下
    *
    *  数据加载形式分两种：
    *  如果设置 isLoadAll 为false，末端子叶在请求后如果不包含数据，则清除i节点
    *  如果设置 isLoadAll 为true，默认加载全部数据，末端子叶不包含i节点
    *  如果设置 isOpen 为 true 树形默认展开，否则 收起 状态 
    *
    *  ul 作为树形页面容器，li对应每个树节点
    *  li 本身绑定节点信息，通过 $li.data("tree-item-data") 获取
    *    li 下有一个文本<span>节点, 展示内容部分
    *    li 下有一个i节点，控制 展开，收起 ，数据的异步加载。点击事件已终止冒泡
    *  如果是异步加载数据，加载后 li 添加 has-loaded="y" 属性防止二次加载
    *
    *  控件加载生命流程：
    *  getSource - (dataItem,callBack) dataItem为上个节点数据，初次为空。callBack 加载回调方法，数据异步获取后callBack(data)完成控件加载
    *     => renderLeafs($parentLi，节点数据列表)  - 加载页容器
    *        => renderLeafDetail（$parentul,单项数据） - 加载具体单叶内容,如果含有子项，递归renderLeafs
    *
     */

+function ($) {
 
    var OSTree = function (element, option) {
        var self = this;

        self.opt = option;
        self.$element = $(element);
        self.firstLoad = true;
        self.$element.data("tree-contain",true);

        self.opt.valueField = this.opt.valueField || "id";
        self.opt.textField = this.opt.textField || "name";
        self.opt.parentField = this.opt.parentField || "parentId";
        self.opt.defaultParentVal = this.opt.defaultParentVal || 0;
       
        self.opt.IsIndented = !!this.opt.childrenField;
        
        self.opt.methods = this.opt.methods || {};
        
        self.opt.methods.chosen = convertToFunc(this.opt.methods.chosen);
        self.opt.methods.format = convertToFunc(this.opt.methods.format);

        self.opt.methods.getSource = convertToFunc(this.opt.methods.getSource);
        self.opt.methods.dataBound = convertToFunc(this.opt.methods.dataBound);
        self.opt.methods.dataBounding = convertToFunc(this.opt.methods.dataBounding);


        if (!!self.opt.methods.getSource) {
            self.initail(self.$element).done(function (dataRes) {

                self.firstLoad = false;
                self.dataSet = dataRes;
                self.$element.find("ul:first").data("tree-root", true);

            });
        }
    }

   

    OSTree.prototype = {
      
        initail: function ($control) {
            
            var os = this;
            const dataItem = $control.data("tree-item-data");
            const defer = $.Deferred();

            os.opt.methods.getSource(dataItem, function (data) {

                os.renderLeafs($control, data);
                defer.resolve(data);

            });

            return defer.promise();
        },

        renderLeafs: function ($leafLi, data) {

            const os = this;
            const opt = os.opt;
            const dataItem = $leafLi.data("tree-item-data");

            // 获取当前渲染数据 
            var leafItems = [];
            const restData = [];  // 如果平级时，获取剩余未渲染的数据

            if (opt.IsIndented) {
                leafItems = data || [];
            } else {
                const parentVal = !dataItem ? opt.defaultParentVal : dataItem[opt.valueField];

                for (let i = 0, count = 0; i < data.length; i++) {

                    if (parentVal === data[i][opt.parentField]) {
                        leafItems[count++] = data[i];
                    } else {
                        restData[i - count] = data[i];
                    }
                }
            }

            //  如果子集元素不存在
            if (leafItems.length === 0) {

                if (opt.isLoadAll || !os.firstLoad) {
                    $leafLi.find(".tree-icon:first").hide();
                }

                return;
            }

            //  处理子集容器
            var $ul = $leafLi.children("ul:first");
            if ($ul.length === 0) {

                $ul = $("<ul></ul>");

                if (!$leafLi.data("tree-contain")) {  //  不是容器自身时，默认子集ul初始化时是折叠状态
                    $ul.hide();  
                }
                $leafLi.append($ul);

                // 根据用户设置，和当前加载情况   决定是否展开
                if ((opt.isOpen && opt.isLoadAll) || !os.firstLoad) {
                    os.switch($leafLi, "open");
                }

            }
            
            // 循环递归渲染节点
            for (let j = 0; j < leafItems.length; j++) {

                const subDataItem = leafItems[j];
                const $subLeaf = os.renderLeafDetail($ul, subDataItem);

                if (opt.isLoadAll) {
                    os.renderLeafs($subLeaf,
                        opt.IsIndented ? subDataItem[opt.childrenField] : restData);
                }
            }
            opt.methods.dataBound(leafItems, $ul); //  数据完成之后执行事件
        },

        renderLeafDetail: function ($ul, dataItem) {
            var os = this;
            var opt = os.opt;
            
            // 设置叶元和数据，并绑定点击事件
            //  li 中会包含自身内容  以及  下属子节点列表的ul
            const $leafLi = $("<li class='tree-leaf' leaf-key='" + (dataItem[opt.valueField]||"") + "'></li>");
            $leafLi.data("tree-item-data", dataItem);
         
            //  叶元素自身内容部分
            const $leafDiv = $("<div class='leaf-body'></div>");   //  节点内容部分
            const $leafIcon = $("<i class='tree-icon plus'></i>");  //   节点内容 - icon 部分
            const $leafText = opt.methods.format.call(os,dataItem);     //  节点内容 - 文本部分 ,用户可以自定义

            $leafDiv.append($leafIcon);
            $leafDiv.append($leafText);

            $leafLi.append($leafDiv);

            // 内容的点击事件
            $leafDiv.off("click").on("click", function (e) {

                var $leafNode = $(this).closest("li");
                var cuDataItem = $leafNode.data("tree-item-data");

                opt.methods.chosen(cuDataItem, $leafNode);

            });
            //  icon 的折叠展开事件
            $leafIcon.off("click").on("click", function (e) {

                os.switch($leafLi);
                e.stopPropagation();

            });

            $ul.append($leafLi);
            opt.methods.dataBounding(dataItem, $leafLi);

            return $leafLi;
        },

        /**
         * 控制节点展开、关闭
         * @param {} $leafLi  节点元素
         * @param {} state  要控制的状态（"open/close"），不传/空 则根据当前已有状态自动转换
         * @returns {} 
         */
        switch: function($leafLi,state) {
            const os = this;
            const opt = os.opt;

            const $leafIcon = $leafLi.find(".tree-icon:first");
            const setOpen = !state ? $leafIcon.hasClass("plus") : state==="open";

            if (setOpen) {

                if (!opt.isLoadAll && !os.firstLoad) {

                    const hasLoaded = $leafIcon.data("had-already-async");
                    if (!hasLoaded) {

                        $leafIcon.data("had-already-async", true);

                        os.initail($leafLi).done(function () {
                            open($leafLi, $leafIcon);
                        });

                        return;
                    }
                }
                open($leafLi, $leafIcon);

            } else {

                $leafLi.children("ul").hide("slow");
                $leafIcon.removeClass("minus").addClass("plus");
            }

            function open($leafLi, $leafIcon) {
                $leafLi.children("ul").show("slow");
                $leafIcon.removeClass("plus").addClass("minus");
            }

        },


        /**
         *   添加叶节点
         * @param {} $parentLeafLi 父叶节点对象
         * @param {} data  添加的节点对象
         */
        add: function ($parentLeafLi, dataItem) {

            const self = this;
            const opt = self.opt;

            // 处理数据
            var cuSet;
            if (!!$parentLeafLi && opt.IsIndented) {

                const currentItem = $parentLeafLi.data("tree-item-data");

                if (!currentItem[opt.childrenField]) {
                    currentItem[opt.childrenField] = [];
                }
                cuSet = currentItem[opt.childrenField];

            } else {
                cuSet = self.dataSet;
            }
            cuSet.push(dataItem);

            // 处理节点
            self.renderLeafs($parentLeafLi || self.$element, [dataItem]);
            if (!!$parentLeafLi) {
                const $leafIcon = $parentLeafLi.find(".tree-icon:first");
                $leafIcon.show("slow"); 
            }

        },
        /**
         * 删除叶节点
         * @param {} $leafLi 需要删除的节点对象
         */
        del: function ($leafLi) {

            const self = this;
            const opt = self.opt;
            const currentItem = $leafLi.data("tree-item-data");

            // 处理数据
            var parentSet;
            const $parnetUl = $leafLi.closest("ul");
            if (opt.IsIndented && !$parnetUl.data("tree-root")) {

                const  $parentLi = $parnetUl.closest("li");
                const  parentItem = $parentLi.data("tree-item-data")|| {};

                parentSet = parentItem[opt.childrenField];

            } else {
                parentSet = self.dataSet;
            }
            removeFromArray(currentItem, parentSet);

            // 处理节点
            $leafLi.remove();
            // 非根级叶节点下不存在子节点时，折叠按钮隐藏
            if ($parnetUl.children("li").length === 0
                && !$parnetUl.data("tree-root")) {
                const $leafIcon = $parnetUl.closest("li").find(".tree-icon:first");
                $leafIcon.hide("slow");
            }
        }
    };


    function convertToFunc(strFunc) {
        var func = null;
        if (!!strFunc
            && (typeof (strFunc) == "function"
                || typeof (func = eval(strFunc)) == "function")) {
            return func || strFunc;
        }
        return function () { };
    }

    function removeFromArray(obj, list) {
        list.splice($.inArray(obj),1);
    }

    var defaultOption = {

        textField: "",
        valueField: "",

        parentField: "",
        defaultParentVal: 0,

        childrenField: "",  //  如果设置，则走递归层级

        isLoadAll: true, //  是否是加载全部数据，否则子节点通过异步方式加载
        isOpen: false, //  是否是展开状态

        methods: {
            //  获取数据源方法
            getSource: function(nodeKey, callBack) {},
            //  选中事件
            chosen: function (dataItem, element) { },

            //  每一个层级执行完成之后事件
            //  data 如果是同级元素，则是全部数据，如果是层级数据，则是子集数据
            //  element 当前层级的ul对象
            dataBound: function (data, element) { },

            //  绑定每个对象时触发
            dataBounding: function(dateItem, leaf) {},

            format: function(item) {
                var value = item[this.opt.textField];
                return $("<span class='leaf-text'>" + value + "</span>");
            }
        }
    };

    var old = $.fn.ostree;

    $.fn.ostree = function (option) {

        var args = Array.apply(null, arguments);
        args.shift();
        var internalReturn;

        this.each(function () {

            const $this = $(this);
            var cacheData = $this.data("os.tree");
            var options = typeof option == "object" && option;

            if (!cacheData) {
                options = $.extend(true, {},defaultOption, options);
                $this.data("os.tree", (cacheData = new OSTree(this, options)));
            }

            if (typeof option == "string" && typeof cacheData[option] == "function") {
                internalReturn = cacheData[option].apply(cacheData, args);
            }
        });

        if (internalReturn !== undefined)
            return internalReturn;
        else
            return this;
    }
    $.fn.ostree.constructor = OSTree;

    // 树冲突处理
    $.fn.ostree.noConflict = function () {
        $.fn.ostree = old;
        return this;
    };
}(window.jQuery);